import { NextResponse } from "next/server";
import {
  constructWebhookEvent,
  retrieveCheckoutSession,
  stripe,
} from "@/lib/stripe";
import { fulfillFromSession } from "@/lib/ship-fulfill";
import { supabaseAdmin } from "@/lib/supabase";
import { reportError } from "@/lib/sentry";
import type Stripe from "stripe";

// Authoritative Stripe webhook. Configure it in the Stripe dashboard
// against this URL (e.g. https://yourapp.com/api/ship/stripe/webhook)
// with these event types subscribed:
//   - checkout.session.completed     → fulfillment (PDFs, mark received)
//   - checkout.session.expired       → mark print_orders.status = "expired"
//   - charge.refunded                → mark "refunded", revoke digital unlock
//   - charge.dispute.created         → mark "disputed", admin investigates
// Stripe signs every delivery with STRIPE_WEBHOOK_SECRET — we verify
// here and refuse unsigned or tampered traffic.
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
    reportError(
      new Error("STRIPE_WEBHOOK_SECRET not configured"),
      "stripe.webhook.no-secret"
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

  // Route on event type. Anything we don't recognize is ack'd with 200
  // so Stripe stops re-delivering it.
  if (event.type === "charge.refunded") {
    return handleChargeRefunded(event.data.object as Stripe.Charge);
  }
  if (event.type === "charge.dispute.created") {
    return handleDisputeCreated(event.data.object as Stripe.Dispute);
  }
  if (event.type === "checkout.session.expired") {
    return handleSessionExpired(event.data.object as Stripe.Checkout.Session);
  }
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
    reportError(err, "stripe.webhook.retrieve-session");
    // 5xx => Stripe retries. Transient network errors shouldn't drop
    // the order on the floor.
    return NextResponse.json({ error: "Temporary" }, { status: 503 });
  }

  // Branch on the metadata.kind we set at session-creation time.
  // Digital purchases just unlock the story; they don't run the
  // print fulfillment pipeline.
  if (session.metadata?.kind === "digital") {
    const storyId = session.metadata?.story_id;
    const metaUserId = session.metadata?.user_id;
    if (!storyId) {
      console.warn(
        "[stripe/webhook] digital session missing story_id metadata"
      );
      return NextResponse.json(
        { received: true, nonRetryable: true, error: "missing story_id" },
        { status: 200 }
      );
    }
    if (session.payment_status !== "paid") {
      return NextResponse.json(
        { received: true, ignored: "unpaid" },
        { status: 200 }
      );
    }
    // Cross-check buyer vs story owner. The buyer's user_id was stashed
    // in metadata at checkout time; the story's owner is the source of
    // truth for who gets the unlock. A mismatch indicates either a
    // future "gift purchase" feature (not yet implemented) or
    // tampering — refuse the unlock until the legitimate flow exists.
    const { data: storyRow, error: storyErr } = await supabaseAdmin()
      .from("stories")
      .select("user_id")
      .eq("id", storyId)
      .maybeSingle<{ user_id: string | null }>();
    if (storyErr) {
      reportError(storyErr, "stripe.webhook.story-lookup");
      return NextResponse.json(
        { error: "Couldn't validate story owner" },
        { status: 503 }
      );
    }
    if (!storyRow) {
      console.warn("[stripe/webhook] story not found for digital unlock");
      return NextResponse.json(
        {
          received: true,
          nonRetryable: true,
          error: "story not found",
        },
        { status: 200 }
      );
    }
    if (metaUserId && storyRow.user_id && metaUserId !== storyRow.user_id) {
      console.warn(
        "[stripe/webhook] digital buyer/owner mismatch — refusing unlock",
        { storyId, metaUserId, ownerId: storyRow.user_id }
      );
      return NextResponse.json(
        {
          received: true,
          nonRetryable: true,
          error: "buyer/owner mismatch",
        },
        { status: 200 }
      );
    }
    const { error: updateErr } = await supabaseAdmin()
      .from("stories")
      .update({ digital_unlocked: true })
      .eq("id", storyId);
    if (updateErr) {
      reportError(updateErr, "stripe.webhook.digital-unlock");
      return NextResponse.json(
        { error: "Couldn't unlock digital story" },
        { status: 503 }
      );
    }
    return NextResponse.json({ received: true, kind: "digital", storyId });
  }

  const outcome = await fulfillFromSession(session);
  if (!outcome.ok) {
    // Let Stripe retry only for transient failures (5xx). Deterministic
    // "can't fulfill" outcomes (missing metadata, story deleted) return
    // 200 so we don't spam retries on orders that will never recover;
    // they're already logged and flagged on the print_orders row.
    const retryable = outcome.status >= 500 && outcome.status !== 501;
    reportError(
      new Error(`fulfill failed: ${outcome.status} ${outcome.error}`),
      "stripe.webhook.fulfill"
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

// A charge can refer back to its parent Checkout Session via the
// payment_intent. We use the PI id to find the matching session via
// Stripe's API, then look up the print_orders row by stripe_session_id.
async function resolveSessionIdForCharge(
  charge: Stripe.Charge
): Promise<string | null> {
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id ?? null;
  if (!paymentIntentId) return null;
  try {
    const sessions = await stripe().checkout.sessions.list({
      payment_intent: paymentIntentId,
      limit: 1,
    });
    return sessions.data[0]?.id ?? null;
  } catch (err) {
    reportError(err, "stripe.webhook.session-lookup");
    return null;
  }
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  const sessionId = await resolveSessionIdForCharge(charge);
  if (!sessionId) {
    // No matching session — this charge isn't ours. Ack so Stripe
    // stops retrying.
    return NextResponse.json({
      received: true,
      ignored: "charge.refunded — no matching session",
    });
  }

  const admin = supabaseAdmin();
  const { data: order } = await admin
    .from("print_orders")
    .select("id, story_id, status")
    .eq("stripe_session_id", sessionId)
    .maybeSingle<{ id: string; story_id: string | null; status: string }>();

  if (!order) {
    return NextResponse.json({
      received: true,
      ignored: "charge.refunded — no matching order row",
    });
  }

  const { error: updateErr } = await admin
    .from("print_orders")
    .update({ status: "refunded" })
    .eq("id", order.id);
  if (updateErr) {
    reportError(updateErr, "stripe.webhook.refund-status-update");
    return NextResponse.json(
      { error: "Couldn't mark order refunded" },
      { status: 503 }
    );
  }

  // Revoke the digital unlock so the refunded purchaser loses online
  // access. We do this unconditionally — if the refund was partial,
  // the admin can manually re-enable from the orders page.
  // Skip if story_id was cleared (e.g. account deletion already
  // hard-deleted the story; FK is ON DELETE SET NULL).
  if (order.story_id) {
    const { error: unlockErr } = await admin
      .from("stories")
      .update({ digital_unlocked: false })
      .eq("id", order.story_id);
    if (unlockErr) {
      reportError(unlockErr, "stripe.webhook.refund-digital-revoke");
    }
  }

  await admin.from("print_order_events").insert({
    order_id: order.id,
    status: "refunded",
    note: `Stripe charge ${charge.id} refunded — digital_unlocked revoked.`,
  });

  return NextResponse.json({
    received: true,
    kind: "refund",
    orderId: order.id,
  });
}

async function handleDisputeCreated(dispute: Stripe.Dispute) {
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (!chargeId) {
    return NextResponse.json({
      received: true,
      ignored: "dispute.created — no charge id",
    });
  }

  let charge: Stripe.Charge;
  try {
    charge = await stripe().charges.retrieve(chargeId);
  } catch (err) {
    reportError(err, "stripe.webhook.dispute-charge-fetch");
    return NextResponse.json({ error: "Temporary" }, { status: 503 });
  }
  const sessionId = await resolveSessionIdForCharge(charge);
  if (!sessionId) {
    return NextResponse.json({
      received: true,
      ignored: "dispute.created — no matching session",
    });
  }

  const admin = supabaseAdmin();
  const { data: order } = await admin
    .from("print_orders")
    .select("id, status")
    .eq("stripe_session_id", sessionId)
    .maybeSingle<{ id: string; status: string }>();

  if (!order) {
    return NextResponse.json({
      received: true,
      ignored: "dispute.created — no matching order row",
    });
  }

  const { error: updateErr } = await admin
    .from("print_orders")
    .update({ status: "disputed" })
    .eq("id", order.id);
  if (updateErr) {
    reportError(updateErr, "stripe.webhook.dispute-status-update");
    return NextResponse.json(
      { error: "Couldn't mark order disputed" },
      { status: 503 }
    );
  }

  await admin.from("print_order_events").insert({
    order_id: order.id,
    status: "disputed",
    note: `Stripe dispute ${dispute.id} (${dispute.reason ?? "unknown reason"}) opened — fulfillment paused.`,
  });

  return NextResponse.json({
    received: true,
    kind: "dispute",
    orderId: order.id,
  });
}

async function handleSessionExpired(session: Stripe.Checkout.Session) {
  const admin = supabaseAdmin();
  const { data: order } = await admin
    .from("print_orders")
    .select("id, status")
    .eq("stripe_session_id", session.id)
    .maybeSingle<{ id: string; status: string }>();

  if (!order) {
    // No pre-created row for this session — just log and ack.
    return NextResponse.json({
      received: true,
      ignored: "session.expired — no matching order row",
    });
  }

  // Only flip to expired from a pre-fulfillment state; if the user
  // somehow paid and we already advanced the order, leave it alone.
  if (!["pending", "paid"].includes(order.status)) {
    return NextResponse.json({
      received: true,
      ignored: `session.expired — order already in '${order.status}'`,
    });
  }

  const { error: updateErr } = await admin
    .from("print_orders")
    .update({ status: "expired" })
    .eq("id", order.id);
  if (updateErr) {
    reportError(updateErr, "stripe.webhook.expire-status-update");
    return NextResponse.json(
      { error: "Couldn't mark order expired" },
      { status: 503 }
    );
  }

  await admin.from("print_order_events").insert({
    order_id: order.id,
    status: "expired",
    note: `Checkout session ${session.id} expired before payment.`,
  });

  return NextResponse.json({
    received: true,
    kind: "expired",
    orderId: order.id,
  });
}
