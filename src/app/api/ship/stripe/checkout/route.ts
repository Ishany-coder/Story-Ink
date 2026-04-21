import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createCheckoutSession } from "@/lib/stripe";
import type { Story } from "@/lib/types";
import type { ShippingAddress } from "@/lib/lulu";

// Creates a Stripe Checkout Session. The client redirects to the returned
// URL; Stripe handles card entry on their hosted page. On success they
// redirect back to /ship/[id]/success?session_id=...

export const maxDuration = 20;

interface Body {
  storyId?: unknown;
  amountUsd?: unknown;
  address?: unknown;
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
  const body = (await request.json().catch(() => ({}))) as Body;
  const storyId = typeof body.storyId === "string" ? body.storyId : "";
  const amountUsd = typeof body.amountUsd === "number" ? body.amountUsd : NaN;
  if (!storyId) {
    return NextResponse.json({ error: "storyId is required" }, { status: 400 });
  }
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  if (amountUsd > 75) {
    return NextResponse.json(
      { error: "Amount exceeds guardrail" },
      { status: 400 }
    );
  }
  if (!isAddress(body.address)) {
    return NextResponse.json(
      { error: "Invalid shipping address" },
      { status: 400 }
    );
  }

  const { data: story, error } = await supabase
    .from("stories")
    .select("id, title")
    .eq("id", storyId)
    .single<Pick<Story, "id" | "title">>();
  if (error || !story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
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
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[stripe/checkout] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout failed" },
      { status: 500 }
    );
  }
}
