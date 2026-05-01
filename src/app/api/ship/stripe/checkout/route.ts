import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createCheckoutSession } from "@/lib/stripe";
import { quotePrintAndShipping, LuluError, friendlyLuluMessage } from "@/lib/lulu";
import { assertOwnsStory, getCurrentUser } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
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

  // Admin bypass: skip Stripe entirely for the admin's own orders.
  // Server-side check — client can't tamper. Creates the print_orders
  // row directly in "received" state, builds the PDFs, and returns
  // a redirect URL the client can navigate to.
  if (isAdminUser(user)) {
    const adminOrigin =
      process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
      new URL(request.url).origin;
    try {
      const orderId = await createAdminOrder({
        storyId,
        userId: user.id,
        address: body.address,
      });
      // Redirect target uses the same success page as the Stripe path
      // but with adminOrder=<id> instead of session_id=<id>. The
      // success component falls through to a "no Stripe to confirm"
      // path below.
      return NextResponse.json({
        url: `${adminOrigin}/ship/${storyId}/success?adminOrder=${orderId}`,
        amountUsd: 0,
      });
    } catch (err) {
      console.error("[stripe/checkout] admin bypass failed:", err);
      return NextResponse.json(
        { error: "Couldn't create admin order. Check the server logs." },
        { status: 500 }
      );
    }
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

// Admin-only path: skip Stripe and write the print_orders row directly,
// then build + upload the PDFs synchronously so the order lands in
// /orders ready to fulfill. No payment, no webhook.
async function createAdminOrder(args: {
  storyId: string;
  userId: string;
  address: ShippingAddress;
}): Promise<string> {
  const admin = supabaseAdmin();

  // Pull the full story for PDF generation. We're already past the
  // assertOwnsStory check, so RLS is moot here — admin uses the
  // service-role client for build steps.
  const { data: story, error: storyErr } = await admin
    .from("stories")
    .select("*")
    .eq("id", args.storyId)
    .single<Story & { pet_id?: string | null }>();
  if (storyErr || !story) throw new Error("Story not found");

  // Insert the row first so we have an id even if PDF build fails.
  const { data: inserted, error: insertErr } = await admin
    .from("print_orders")
    .insert({
      story_id: args.storyId,
      status: "building",
      amount_usd: 0,
      stripe_session_id: null,
      shipping_address: JSON.stringify(args.address),
      user_id: args.userId,
    })
    .select("id")
    .single<{ id: string }>();
  if (insertErr || !inserted) {
    console.error("[admin order] insert failed:", insertErr);
    throw new Error("Couldn't insert admin order row");
  }
  const orderId = inserted.id;

  // Pull the pet (memorial mode adds dedication pages).
  const petId = story.pet_id ?? null;
  let pet = null;
  if (petId) {
    const { data: petRow } = await admin
      .from("pets")
      .select("*")
      .eq("id", petId)
      .maybeSingle();
    pet = petRow ?? null;
  }

  try {
    // Lazy import — buildAndUploadPrintPdfs is heavy and only needed
    // here. Top-level import would bloat the route's cold start.
    const { buildAndUploadPrintPdfs } = await import("@/lib/print-pdf");
    const built = await buildAndUploadPrintPdfs(story as Story, pet);
    await admin
      .from("print_orders")
      .update({
        status: "received",
        interior_pdf_url: built.interiorUrl,
        cover_pdf_url: built.coverUrl,
      })
      .eq("id", orderId);
    await admin.from("print_order_events").insert({
      order_id: orderId,
      status: "received",
      note: "Admin order — no payment; PDFs built; awaiting manual fulfillment.",
      actor_id: args.userId,
    });
  } catch (err) {
    console.error("[admin order] pdf build failed:", err);
    await admin
      .from("print_orders")
      .update({ status: "failed" })
      .eq("id", orderId);
    await admin.from("print_order_events").insert({
      order_id: orderId,
      status: "failed",
      note:
        "Admin order — PDF generation failed: " +
        (err instanceof Error ? err.message : "unknown"),
      actor_id: args.userId,
    });
    throw err;
  }

  return orderId;
}
