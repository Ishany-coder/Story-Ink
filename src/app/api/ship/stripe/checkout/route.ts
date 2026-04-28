import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createCheckoutSession } from "@/lib/stripe";
import { quotePrintAndShipping, LuluError, friendlyLuluMessage } from "@/lib/lulu";
import { assertOwnsStory, getCurrentUser } from "@/lib/supabase-server";
import type { Story, StoryPage } from "@/lib/types";
import type { ShippingAddress } from "@/lib/lulu";

// Creates a Stripe Checkout Session. The client redirects to the returned
// URL; Stripe handles card entry on their hosted page. On success they
// redirect back to /ship/[id]/success?session_id=...
//
// The total is recomputed server-side from a fresh Lulu quote — the
// client is never allowed to dictate the amount charged. The client's
// displayed quote may have drifted (address changed, Lulu price update),
// in which case we return the new quote so the UI can re-confirm before
// charging.

export const maxDuration = 30;

// Safety cap on any single print order to bound the blast radius of a
// bug or pricing change. Keep well above a realistic max-page, rush-ship
// book total.
const MAX_ALLOWED_USD = 150;

interface Body {
  storyId?: unknown;
  address?: unknown;
  // Client's display price, in USD. Not used for the charge — only for a
  // drift check so we can tell the user "price changed, please confirm"
  // instead of silently charging a different amount. Optional.
  expectedAmountUsd?: unknown;
}

function isAddress(v: unknown): v is ShippingAddress {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  const str = (k: string) =>
    typeof a[k] === "string" && (a[k] as string).trim().length > 0;
  return !!(
    str("name") &&
    str("street1") &&
    str("city") &&
    str("state_code") &&
    str("country_code") &&
    str("postcode") &&
    str("phone_number")
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Body;
  const storyId = typeof body.storyId === "string" ? body.storyId : "";
  if (!storyId) {
    return NextResponse.json({ error: "storyId is required" }, { status: 400 });
  }
  if (!isAddress(body.address)) {
    return NextResponse.json(
      { error: "Invalid shipping address" },
      { status: 400 }
    );
  }

  const denied = await assertOwnsStory(storyId, user.id);
  if (denied) return denied;

  const { data: story, error } = await supabaseAdmin()
    .from("stories")
    .select("id, title, pages")
    .eq("id", storyId)
    .single<Pick<Story, "id" | "title" | "pages">>();
  if (error || !story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  // Recompute the quote from Lulu *right now*, using the address the
  // user just submitted. This is the only amount we charge — whatever
  // the client said is ignored.
  let quote;
  try {
    quote = await quotePrintAndShipping({
      pageCount: (story.pages as StoryPage[]).length,
      quantity: 1,
      address: body.address,
    });
  } catch (err) {
    if (err instanceof LuluError) {
      console.error("[stripe/checkout] lulu quote error:", err);
      const status = err.status === 400 ? 400 : 502;
      return NextResponse.json({ error: friendlyLuluMessage(err) }, { status });
    }
    console.error("[stripe/checkout] quote failed:", err);
    return NextResponse.json(
      { error: "Couldn't get a shipping quote. Try again." },
      { status: 500 }
    );
  }

  const amountUsd = Math.round(quote.totalUsd * 100) / 100;
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return NextResponse.json(
      { error: "Quote returned an invalid total" },
      { status: 502 }
    );
  }
  if (amountUsd > MAX_ALLOWED_USD) {
    return NextResponse.json(
      { error: "Quote exceeds safety cap; contact support" },
      { status: 400 }
    );
  }

  // Drift check: if the caller told us what price they were shown and it
  // disagrees with the live quote by more than 25¢, refuse and return
  // the fresh quote so the UI can re-confirm. Prevents "price jumped in
  // the 30 seconds between quote and checkout" surprise charges.
  const expected =
    typeof body.expectedAmountUsd === "number" ? body.expectedAmountUsd : null;
  if (expected !== null && Math.abs(expected - amountUsd) > 0.25) {
    return NextResponse.json(
      {
        error: "Price changed — please re-confirm the updated total.",
        code: "price_changed",
        quote,
      },
      { status: 409 }
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;

  try {
    const { url } = await createCheckoutSession({
      storyId,
      storyTitle: story.title,
      amountUsd,
      address: body.address,
      successUrl: `${origin}/ship/${storyId}/success`,
      cancelUrl: `${origin}/ship/${storyId}`,
    });
    return NextResponse.json({ url, amountUsd });
  } catch (err) {
    console.error("[stripe/checkout] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout failed" },
      { status: 500 }
    );
  }
}
