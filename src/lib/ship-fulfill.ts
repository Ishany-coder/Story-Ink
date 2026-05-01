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

  // Fetch the full story for PDF generation. Use the admin client so
  // we bypass RLS — the webhook path has no user session, and the
  // confirm path has already verified ownership before getting here.
  const { data: story, error: fetchErr } = await admin
    .from("stories")
    .select("*")
    .eq("id", storyId)
    .single<Story>();
  if (fetchErr || !story) {
    return { ok: false, status: 404, error: "Story not found" };
  }

  const amountUsd =
    typeof session.amount_total === "number"
      ? session.amount_total / 100
      : null;

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
  } else {
    const { data: inserted, error: insertErr } = await admin
      .from("print_orders")
      .insert({
        story_id: storyId,
        status: "paid",
        amount_usd: amountUsd,
        stripe_session_id: sessionId,
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
        console.error("[ship-fulfill] insert failed:", insertErr);
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
    console.error("[ship-fulfill] claim failed:", claimErr);
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
    console.error("[ship-fulfill] pdf build failed:", err);
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

  return {
    ok: true,
    orderId,
    status: "received",
    alreadyProcessed: false,
  };
}
