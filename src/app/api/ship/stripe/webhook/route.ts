import { NextResponse } from "next/server";
import {
  constructWebhookEvent,
  retrieveCheckoutSession,
} from "@/lib/stripe";
import { fulfillFromSession } from "@/lib/ship-fulfill";
import type Stripe from "stripe";

// Authoritative Stripe webhook. Configure it in the Stripe dashboard
// against this URL (e.g. https://yourapp.com/api/ship/stripe/webhook)
// with the event type `checkout.session.completed`. Stripe signs every
// delivery with STRIPE_WEBHOOK_SECRET — we verify here and refuse
// unsigned or tampered traffic.
//
// On success we hand off to `fulfillFromSession`, which is idempotent
// on stripe_session_id. Stripe retries failed deliveries with backoff;
// return 2xx only after fulfillment (or a deterministic "not payable"
// outcome) so retries actually help.

export const maxDuration = 120;

// Do NOT parse body — we need the raw bytes to compute the signature.
// Next.js App Router gives us Request; reading .text() preserves bytes
// for the SHA256.
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      "[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set — refusing delivery"
    );
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(raw, signature, secret);
  } catch (err) {
    // Bad signature / malformed body. 400 tells Stripe not to retry.
    console.warn(
      "[stripe/webhook] signature verification failed:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  // We only act on paid checkout sessions. Other event types ack with
  // 200 so Stripe stops delivering them (we can widen the list later).
  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const sessionPartial = event.data.object as Stripe.Checkout.Session;
  // The event payload contains enough to fulfill, but payment_intent
  // and other relationships are un-expanded. Re-fetch with expand so
  // `fulfillFromSession` (and its consumers) see the same shape they'd
  // see from retrieveCheckoutSession in the confirm path.
  let session: Stripe.Checkout.Session;
  try {
    session = await retrieveCheckoutSession(sessionPartial.id);
  } catch (err) {
    console.error(
      "[stripe/webhook] failed to fetch expanded session; will retry:",
      err
    );
    // 5xx => Stripe retries. Transient network errors shouldn't drop
    // the order on the floor.
    return NextResponse.json({ error: "Temporary" }, { status: 503 });
  }

  const outcome = await fulfillFromSession(session);
  if (!outcome.ok) {
    // Let Stripe retry only for transient failures (5xx). Deterministic
    // "can't fulfill" outcomes (missing metadata, story deleted) return
    // 200 so we don't spam retries on orders that will never recover;
    // they're already logged and flagged on the print_orders row.
    const retryable = outcome.status >= 500 && outcome.status !== 501;
    console.error(
      "[stripe/webhook] fulfill failed:",
      outcome.status,
      outcome.error
    );
    if (retryable) {
      return NextResponse.json(
        { error: outcome.error, orderId: outcome.orderId },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        received: true,
        nonRetryable: true,
        error: outcome.error,
        orderId: outcome.orderId,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    received: true,
    orderId: outcome.orderId,
    status: outcome.status,
    alreadyProcessed: outcome.alreadyProcessed,
  });
}
