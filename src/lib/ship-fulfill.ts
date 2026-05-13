// Shared fulfillment pipeline for a paid Stripe Checkout session.
//
// As of the manual-fulfillment switch, this no longer auto-calls Lulu.
// The flow is now:
//
//   Stripe checkout → webhook fires → fulfillFromSession()
//     → build interior + cover PDFs
//     → upload to Supabase Storage
//     → mark print_orders.status = "received"
//     → write print_order_events row (audit log)
//
// The admin's /orders queue picks it up from there. They download the
// PDFs, place the print order on Lulu (or any vendor) themselves,
// then click through the status transitions.
//
// Two entry points still call this:
//   - /api/ship/stripe/webhook (authoritative, signature-verified).
//   - /api/ship/stripe/confirm (opportunistic, success page hit).
//
// The function is idempotent on `stripe_session_id` via a unique
// index on print_orders.stripe_session_id plus an atomic CAS on
// status. Running it twice for the same session returns the same
// order row and never builds the PDFs twice.

import { supabaseAdmin } from "@/lib/supabase";
import { buildAndUploadPrintPdfs } from "@/lib/print-pdf";
import { unpackAddressMetadata } from "@/lib/stripe";
import { reportError } from "@/lib/sentry";
import { sendEmail } from "@/lib/email";
import { orderConfirmation } from "@/lib/email-templates/order-confirmation";
import type { Pet, Story } from "@/lib/types";
import type Stripe from "stripe";

export type FulfillOutcome =
  | {
      ok: true;
      orderId: string;
      status: string;
      alreadyProcessed: boolean;
    }
  | {
      ok: false;
      status: number;
      error: string;
      orderId?: string;
    };

export async function fulfillFromSession(
  session: Stripe.Checkout.Session
): Promise<FulfillOutcome> {
  if (session.payment_status !== "paid") {
    return {
      ok: false,
      status: 402,
      error: `Session not paid yet (status: ${session.payment_status})`,
    };
  }

  const sessionId = session.id;
  const storyId = session.metadata?.story_id;
  const addressRaw = session.metadata?.address;
  if (!storyId || !addressRaw) {
    return {
      ok: false,
      status: 400,
      error: "Session is missing story_id / address metadata",
    };
  }
  const address = unpackAddressMetadata(addressRaw);
  if (!address) {
    return {
      ok: false,
      status: 400,
      error: "Couldn't parse address from session metadata",
    };
  }
  // Quantity was stashed in metadata at checkout time. Default to 1
  // for legacy sessions that pre-date the quantity feature.
  const quantityRaw = session.metadata?.quantity;
  const parsedQuantity = quantityRaw ? parseInt(quantityRaw, 10) : 1;
  const quantity =
    Number.isFinite(parsedQuantity) && parsedQuantity >= 1 && parsedQuantity <= 10
      ? parsedQuantity
      : 1;

  const admin = supabaseAdmin();

  // Idempotency: if we've already fulfilled this session (PDFs built,
  // status advanced past "paid"), return the existing row.
  const { data: existing } = await admin
    .from("print_orders")
    .select("id, status, interior_pdf_url, cover_pdf_url")
    .eq("stripe_session_id", sessionId)
    .maybeSingle<{
      id: string;
      status: string;
      interior_pdf_url: string | null;
      cover_pdf_url: string | null;
    }>();

  if (existing && existing.interior_pdf_url) {
    return {
      ok: true,
      orderId: existing.id,
      status: existing.status,
      alreadyProcessed: true,
    };
  }

  // Refuse to advance a refunded / disputed / expired order. These are
  // terminal-ish states set by the Stripe webhook (charge.refunded,
  // charge.dispute.created, checkout.session.expired) and we must not
  // build PDFs or move the order toward fulfillment under any of them.
  if (existing && ["refunded", "disputed", "expired"].includes(existing.status)) {
    return {
      ok: false,
      status: 409,
      error: `Order is in '${existing.status}' state — refusing to advance to fulfillment.`,
      orderId: existing.id,
    };
  }

  // Fetch the full story for PDF generation. Use the admin client so
  // we bypass RLS — the webhook path has no user session, and the
  // confirm path has already verified ownership before getting here.
  const { data: story, error: fetchErr } = await admin
    .from("stories")
    .select("*")
    .eq("id", storyId)
    .single<Story>();
  if (fetchErr || !story) {
    reportError(fetchErr ?? new Error("Story not found"), "ship-fulfill.story-fetch");
    return { ok: false, status: 404, error: "Story not found" };
  }

  const amountUsd =
    typeof session.amount_total === "number"
      ? session.amount_total / 100
      : null;

  // Stripe Checkout only assigns a PaymentIntent once the session
  // completes; retrieveCheckoutSession() is called with
  // expand:["payment_intent"] so `session.payment_intent` is either
  // the expanded object or its string id (older API responses).
  // Persisting it on the print_orders row lets the refund/dispute
  // webhook look up the order directly without the fragile
  // checkout.sessions.list({ payment_intent }) round-trip.
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  // Persist the address on the order so admin can see where to ship
  // without re-pulling from Stripe later. Sensitive PII so we keep
  // it redacted in logs.
  const addressJson = JSON.stringify(address);

  // Create (or reuse) the print_orders row for this session. The
  // unique index on stripe_session_id makes this safe under
  // concurrent callers.
  let orderId: string;
  if (existing) {
    orderId = existing.id;
    // Backfill payment_intent_id on a pre-existing row (e.g. one we
    // pre-created at checkout time and now we have the PI after the
    // session completed). Best-effort: if the update fails the
    // webhook session-list fallback still kicks in.
    if (paymentIntentId) {
      await admin
        .from("print_orders")
        .update({ payment_intent_id: paymentIntentId })
        .eq("id", orderId)
        .is("payment_intent_id", null);
    }
  } else {
    const { data: inserted, error: insertErr } = await admin
      .from("print_orders")
      .insert({
        story_id: storyId,
        status: "paid",
        amount_usd: amountUsd,
        stripe_session_id: sessionId,
        payment_intent_id: paymentIntentId,
        shipping_address: addressJson,
        quantity,
        user_id: (story as Story & { user_id?: string | null }).user_id ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (insertErr || !inserted) {
      // Concurrent caller may have inserted between our select +
      // insert. Refetch by session id.
      const { data: retry } = await admin
        .from("print_orders")
        .select("id, status, interior_pdf_url")
        .eq("stripe_session_id", sessionId)
        .maybeSingle<{
          id: string;
          status: string;
          interior_pdf_url: string | null;
        }>();
      if (retry?.interior_pdf_url) {
        return {
          ok: true,
          orderId: retry.id,
          status: retry.status,
          alreadyProcessed: true,
        };
      }
      if (!retry) {
        reportError(insertErr, "ship-fulfill.insert");
        return {
          ok: false,
          status: 500,
          error:
            "Payment succeeded but we couldn't record the order. Contact support with session id " +
            sessionId,
        };
      }
      orderId = retry.id;
    } else {
      orderId = inserted.id;
    }
  }

  // Atomic claim: move status "paid" → "building". If two fulfillers
  // race, only one gets a row update; the loser sees rowsAffected=0
  // and returns the winner's result.
  const { data: claimed, error: claimErr } = await admin
    .from("print_orders")
    .update({ status: "building" })
    .eq("id", orderId)
    .eq("status", "paid")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (claimErr) {
    reportError(claimErr, "ship-fulfill.claim");
    return {
      ok: false,
      status: 500,
      error: "Couldn't claim order for fulfillment",
      orderId,
    };
  }

  if (!claimed) {
    // Another worker already advanced this order. Return its
    // current state rather than racing.
    const { data: current } = await admin
      .from("print_orders")
      .select("id, status, interior_pdf_url")
      .eq("id", orderId)
      .single<{
        id: string;
        status: string;
        interior_pdf_url: string | null;
      }>();
    if (current?.interior_pdf_url) {
      return {
        ok: true,
        orderId: current.id,
        status: current.status,
        alreadyProcessed: true,
      };
    }
    return {
      ok: false,
      status: 409,
      error: `Order already being processed (status: ${
        current?.status ?? "unknown"
      })`,
      orderId,
    };
  }

  // For memorial pet stories we add dedication pages to the interior
  // PDF, so fetch the pet here. Generic stories pass null.
  let pet: Pet | null = null;
  const storyPetId = (story as Story & { pet_id?: string | null }).pet_id ?? null;
  if (storyPetId) {
    const { data: petRow } = await admin
      .from("pets")
      .select("*")
      .eq("id", storyPetId)
      .maybeSingle<Pet>();
    pet = petRow ?? null;
  }

  // Build and upload PDFs. On success, advance status to "received"
  // (admin queue) and write an audit log row.
  let interiorUrl: string;
  let coverUrl: string;
  try {
    const built = await buildAndUploadPrintPdfs(story, pet);
    interiorUrl = built.interiorUrl;
    coverUrl = built.coverUrl;
  } catch (err) {
    reportError(err, "ship-fulfill.pdf-build");
    await admin
      .from("print_orders")
      .update({ status: "failed" })
      .eq("id", orderId);
    await admin.from("print_order_events").insert({
      order_id: orderId,
      status: "failed",
      note: "PDF generation failed",
    });
    return {
      ok: false,
      status: 500,
      error: "PDF generation failed. We'll follow up.",
      orderId,
    };
  }

  await admin
    .from("print_orders")
    .update({
      status: "received",
      interior_pdf_url: interiorUrl,
      cover_pdf_url: coverUrl,
    })
    .eq("id", orderId);
  await admin.from("print_order_events").insert({
    order_id: orderId,
    status: "received",
    note: "Stripe payment confirmed; PDFs built; awaiting manual fulfillment.",
  });

  // Hardcover bundle includes digital — unlock the online reader +
  // PDF download for the buyer at the same time. No-op if already
  // unlocked.
  await admin
    .from("stories")
    .update({ digital_unlocked: true })
    .eq("id", storyId);

  // Fire the customer-facing order confirmation email. Failures here
  // don't roll back fulfillment — `sendEmail` swallows + reports its
  // own errors, and the admin queue is still the source of truth.
  // The companion "shipped" email is fired from
  // /api/orders/[id]/status when the admin advances the order to
  // 'shipped'.
  await sendOrderConfirmationEmail({
    userId: (story as Story & { user_id?: string | null }).user_id ?? null,
    storyTitle: story.title,
    orderId,
    pageCount: story.page_count ?? 0,
    amountUsd: amountUsd ?? 0,
  });

  return {
    ok: true,
    orderId,
    status: "received",
    alreadyProcessed: false,
  };
}

// Look up the buyer's email via the Supabase auth admin API and send
// the order confirmation. Best-effort: any failure is logged through
// `reportError` (inside sendEmail) but never throws — fulfillment has
// already advanced past the point where it could be rolled back.
async function sendOrderConfirmationEmail(args: {
  userId: string | null;
  storyTitle: string;
  orderId: string;
  pageCount: number;
  amountUsd: number;
}): Promise<void> {
  if (!args.userId) return;
  try {
    const admin = supabaseAdmin();
    const { data, error } = await admin.auth.admin.getUserById(args.userId);
    if (error || !data.user?.email) return;
    const tpl = orderConfirmation({
      storyTitle: args.storyTitle,
      orderId: args.orderId,
      pageCount: args.pageCount,
      amountUsd: args.amountUsd,
    });
    await sendEmail({
      to: data.user.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
  } catch (err) {
    reportError(err, "ship-fulfill.send-order-confirmation");
  }
}
