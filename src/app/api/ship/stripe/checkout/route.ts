import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createCheckoutSession } from "@/lib/stripe";
import { assertOwnsStory, getCurrentUser } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { isBetaTesting } from "@/lib/beta-flag";
import { priceHardcoverUsd } from "@/lib/pricing";
import { assertNoBypassInProd, assertStripeKeyMatchesEnv } from "@/lib/env-guard";
import { isShippingAddress, type ShippingAddress } from "@/lib/shipping";
import { enforceRateLimit, LIMITS, userKey } from "@/lib/rate-limit";
import type { Story, StoryPage } from "@/lib/types";

// Creates a Stripe Checkout Session. The client redirects to the returned
// URL; Stripe handles card entry on their hosted page. On success they
// redirect back to /ship/[id]/success?session_id=...
//
// The total is recomputed server-side from the static price formula so
// the client can't dictate the amount charged. Pricing is page-count
// based (shipping bundled in); Lulu auto-quote/auto-fulfill was removed
// in favor of manual admin fulfillment.

export const maxDuration = 30;

// Safety cap on any single print order to bound the blast radius of a
// bug or pricing change. Scaled to allow for the max quantity below.
const MAX_ALLOWED_USD = 600;

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 10;

interface Body {
  storyId?: unknown;
  address?: unknown;
  // Client's display price, in USD. Not used for the charge — only for a
  // drift check so we can tell the user "price changed, please confirm"
  // instead of silently charging a different amount. Optional.
  expectedAmountUsd?: unknown;
  quantity?: unknown;
}

function parseQuantity(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 1;
  const n = Math.trunc(raw);
  if (n < MIN_QUANTITY) return MIN_QUANTITY;
  if (n > MAX_QUANTITY) return MAX_QUANTITY;
  return n;
}

export async function POST(request: Request) {
  // Closed-beta kill switch — match /ship/[id]'s notFound() behavior
  // so the API surface disappears in lockstep with the UI.
  if (isBetaTesting()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const limited = await enforceRateLimit({
    ...LIMITS.checkout,
    key: userKey("checkout", user.id),
  });
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as Body;
  const storyId = typeof body.storyId === "string" ? body.storyId : "";
  if (!storyId) {
    return NextResponse.json({ error: "storyId is required" }, { status: 400 });
  }
  if (!isShippingAddress(body.address)) {
    return NextResponse.json(
      { error: "Invalid shipping address" },
      { status: 400 }
    );
  }

  const quantity = parseQuantity(body.quantity);

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

  // Skip Stripe entirely when (a) the user is the admin or (b) the
  // dev/testing flag BYPASS_STRIPE=1 is set in the environment AND the
  // caller is admin. A non-admin caller never gets a bypass even if
  // BYPASS_STRIPE leaks into prod env — and assertNoBypassInProd hard-
  // fails the request if the flag is set in production at all.
  assertNoBypassInProd();
  // Hard-fail if STRIPE_SECRET_KEY's mode (test/live) doesn't match
  // NODE_ENV — prevents accidentally hitting live Stripe from dev.
  assertStripeKeyMatchesEnv();
  // Admin always bypasses (test orders, demo fulfillment). BYPASS_STRIPE
  // is a dev-time convenience that only takes effect for admins — a
  // misconfigured prod env can't unlock free orders for normal users.
  const bypass = isAdminUser(user);
  if (bypass) {
    const adminOrigin =
      process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
      new URL(request.url).origin;
    try {
      const orderId = await createAdminOrder({
        storyId,
        userId: user.id,
        address: body.address,
        quantity,
        reason: isAdminUser(user) ? "admin" : "bypass_stripe_env",
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

  // Static price: HARDCOVER_BASE_USD + per-page surcharge over 30,
  // multiplied by quantity. Shipping is bundled in. The client's
  // displayed price is informational only — server is authoritative.
  const pageCount = (story.pages as StoryPage[]).length;
  const unitUsd = priceHardcoverUsd(pageCount);
  const rawAmountUsd = unitUsd * quantity;
  const amountUsd = Math.round(rawAmountUsd * 100) / 100;
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return NextResponse.json(
      { error: "Couldn't compute an order total" },
      { status: 500 }
    );
  }
  if (amountUsd > MAX_ALLOWED_USD) {
    return NextResponse.json(
      { error: "Order exceeds safety cap; contact support" },
      { status: 400 }
    );
  }

  // Drift check: if the caller told us what price they were shown and
  // it disagrees with the server total by more than 25¢, refuse so the
  // UI can re-confirm. Now that pricing is static this only fires when
  // the page count or quantity changed between display and submit.
  const expected =
    typeof body.expectedAmountUsd === "number" ? body.expectedAmountUsd : null;
  if (expected !== null && Math.abs(expected - amountUsd) > 0.25) {
    return NextResponse.json(
      {
        error: "Price changed — please re-confirm the updated total.",
        code: "price_changed",
        amountUsd,
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
      quantity,
      successUrl: `${origin}/ship/${storyId}/success`,
      cancelUrl: `${origin}/ship/${storyId}`,
      userId: user.id,
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
  quantity: number;
  reason: "admin" | "bypass_stripe_env";
}): Promise<string> {
  const admin = supabaseAdmin();

  // Guard: if the story has any existing order in a disputed or
  // refunded state, refuse to create a new admin order. The admin
  // should resolve the dispute / refund first before issuing a new
  // freebie that could be mistaken for the disputed one.
  const { data: blocking } = await admin
    .from("print_orders")
    .select("id, status")
    .eq("story_id", args.storyId)
    .in("status", ["disputed", "refunded"])
    .limit(1)
    .maybeSingle<{ id: string; status: string }>();
  if (blocking) {
    throw new Error(
      `Refusing to create admin order — existing order ${blocking.id} is in '${blocking.status}' state.`
    );
  }

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
      quantity: args.quantity,
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
      note:
        args.reason === "admin"
          ? "Admin order — no payment; PDFs built; awaiting manual fulfillment."
          : "Test order via BYPASS_STRIPE — no payment; PDFs built.",
      actor_id: args.userId,
    });
    // Hardcover bundle includes the digital tier — unlock the online
    // reader + PDF download. Same on the bypass path so testing
    // matches production behavior.
    await admin
      .from("stories")
      .update({ digital_unlocked: true })
      .eq("id", args.storyId);
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
