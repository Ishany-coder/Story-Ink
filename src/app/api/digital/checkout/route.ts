import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";
import { assertOwnsStory, getCurrentUser } from "@/lib/supabase-server";
import { DIGITAL_PRICE_USD } from "@/lib/pricing";

// Digital tier checkout. Unlocks online reading + PDF download for the
// owner's own story. No print pipeline, no shipping address, no Lulu
// quote.
//
// Bypass flag honored: when BYPASS_STRIPE=1, flip digital_unlocked
// directly without going to Stripe so admins can test the unlocked
// reader without paying.

export const maxDuration = 20;

interface Body {
  storyId?: unknown;
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

  const denied = await assertOwnsStory(storyId, user.id);
  if (denied) return denied;

  const admin = supabaseAdmin();

  // Idempotency: if it's already unlocked, just send them to the reader.
  const origin =
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;
  const successUrl = `${origin}/read/${storyId}?digitalUnlocked=1`;

  const { data: story } = await admin
    .from("stories")
    .select("id, title, digital_unlocked")
    .eq("id", storyId)
    .maybeSingle<{ id: string; title: string; digital_unlocked: boolean }>();
  if (!story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }
  if (story.digital_unlocked) {
    return NextResponse.json({ url: successUrl, alreadyUnlocked: true });
  }

  // Bypass flow — flip the flag and short-circuit Stripe.
  if (process.env.BYPASS_STRIPE === "1") {
    await admin
      .from("stories")
      .update({ digital_unlocked: true })
      .eq("id", storyId);
    return NextResponse.json({ url: successUrl, bypassed: true });
  }

  // Real Stripe checkout for the digital unlock.
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Digital storybook: ${story.title.slice(0, 70)}`,
              description:
                "Read online forever + downloadable PDF. Personalized, photo-grounded, instant access.",
            },
            unit_amount: Math.round(DIGITAL_PRICE_USD * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        kind: "digital",
        story_id: storyId,
        user_id: user.id,
      },
      success_url: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/read/${storyId}`,
    });
    if (!session.url) {
      throw new Error("Stripe created a digital session without a URL");
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[digital/checkout] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout failed" },
      { status: 500 }
    );
  }
}
