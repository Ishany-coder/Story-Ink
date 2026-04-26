// Shared fulfillment pipeline for a paid Stripe Checkout session.
//
// Two entry points call this:
//   - /api/ship/stripe/webhook (authoritative, signature-verified).
//     This is where real fulfillment happens in prod.
//   - /api/ship/stripe/confirm (opportunistic, called by the success
//     page). Useful for local dev without a webhook forwarder, and as a
//     safety net if the webhook delivery is delayed.
//
// The function is idempotent on `stripe_session_id` via a unique index
// on print_orders.stripe_session_id plus an atomic status transition.
// Running it twice for the same session returns the same order row and
// never creates a duplicate Lulu print job.
//
// Shape of the state machine on print_orders.status:
//   (missing row) → "paid" → "pdf_failed" | "printing" | "lulu_failed"
//
// The row exists from the moment we observe a paid session. The Lulu
// print job is only created once — the CAS on status ("paid" → "paid")
// is how we prevent two concurrent fulfillers from double-shipping.

import { supabaseAdmin } from "@/lib/supabase";
import { createPrintJob, LuluError } from "@/lib/lulu";
import { buildAndUploadPrintPdfs } from "@/lib/print-pdf";
import { unpackAddressMetadata } from "@/lib/stripe";
import type { Story } from "@/lib/types";
import type Stripe from "stripe";

export type FulfillOutcome =
  | {
      ok: true;
      orderId: string;
      luluJobId: string;
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

  const admin = supabaseAdmin();

  // Idempotency: if we've already fulfilled this session, return the
  // existing row. Callers hitting us twice (webhook retry + success
  // page confirm) won't double-ship.
  const { data: existing } = await admin
    .from("print_orders")
    .select("id, status, lulu_print_job_id")
    .eq("stripe_session_id", sessionId)
    .maybeSingle<{
      id: string;
      status: string;
      lulu_print_job_id: string | null;
    }>();

  if (existing?.lulu_print_job_id) {
    return {
      ok: true,
      orderId: existing.id,
      luluJobId: existing.lulu_print_job_id,
      status: existing.status,
      alreadyProcessed: true,
    };
  }

  // Fetch the full story for PDF generation. Use the admin client so
  // we bypass RLS — the webhook path has no user session, and the
  // confirm path has already verified ownership before getting here.
  const { data: story, error: fetchErr } = await supabaseAdmin()
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

  // Create (or reuse) the print_orders row for this session. The unique
  // index on stripe_session_id makes this safe under concurrent callers
  // — one insert wins, the other falls back to the select branch.
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
        // Capture the buyer so they can see their own order on /ship.
        // RLS on print_orders is read-by-owner.
        user_id: (story as Story & { user_id?: string | null }).user_id ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (insertErr || !inserted) {
      // A concurrent caller may have inserted it between our select and
      // insert — refetch by session id before giving up.
      const { data: retry } = await admin
        .from("print_orders")
        .select("id, status, lulu_print_job_id")
        .eq("stripe_session_id", sessionId)
        .maybeSingle<{
          id: string;
          status: string;
          lulu_print_job_id: string | null;
        }>();
      if (retry?.lulu_print_job_id) {
        return {
          ok: true,
          orderId: retry.id,
          luluJobId: retry.lulu_print_job_id,
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

  // Atomic claim: move status "paid" → "processing". If two fulfillers
  // race, only one gets a row update; the loser sees rowsAffected=0 and
  // can safely return (the winner is doing the work). We retry-read to
  // surface the winner's result to the loser.
  const { data: claimed, error: claimErr } = await admin
    .from("print_orders")
    .update({ status: "processing" })
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
    // Another worker has already advanced this order. Return its
    // current state rather than racing.
    const { data: current } = await admin
      .from("print_orders")
      .select("id, status, lulu_print_job_id")
      .eq("id", orderId)
      .single<{
        id: string;
        status: string;
        lulu_print_job_id: string | null;
      }>();
    if (current?.lulu_print_job_id) {
      return {
        ok: true,
        orderId: current.id,
        luluJobId: current.lulu_print_job_id,
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

  // Build and upload PDFs.
  let interiorUrl: string;
  let coverUrl: string;
  let pageCount: number;
  try {
    const built = await buildAndUploadPrintPdfs(story);
    interiorUrl = built.interiorUrl;
    coverUrl = built.coverUrl;
    pageCount = built.pageCount;
    await admin
      .from("print_orders")
      .update({ interior_pdf_url: interiorUrl, cover_pdf_url: coverUrl })
      .eq("id", orderId);
  } catch (err) {
    console.error("[ship-fulfill] pdf build failed:", err);
    await admin
      .from("print_orders")
      .update({ status: "pdf_failed" })
      .eq("id", orderId);
    return {
      ok: false,
      status: 500,
      error: "PDF generation failed. We'll follow up.",
      orderId,
    };
  }

  // Hand off to Lulu.
  try {
    const result = await createPrintJob({
      interiorPdfUrl: interiorUrl,
      coverPdfUrl: coverUrl,
      pageCount,
      quantity: 1,
      address,
      externalId: orderId,
    });
    await admin
      .from("print_orders")
      .update({ status: "printing", lulu_print_job_id: result.luluJobId })
      .eq("id", orderId);
    return {
      ok: true,
      orderId,
      luluJobId: result.luluJobId,
      status: "printing",
      alreadyProcessed: false,
    };
  } catch (err) {
    if (err instanceof LuluError) {
      console.error("[ship-fulfill] lulu error:", err);
      await admin
        .from("print_orders")
        .update({ status: "lulu_failed" })
        .eq("id", orderId);
      return {
        ok: false,
        status: 502,
        error:
          "Payment captured but the print job couldn't be created: " +
          err.message,
        orderId,
      };
    }
    console.error("[ship-fulfill] unexpected lulu error:", err);
    await admin
      .from("print_orders")
      .update({ status: "lulu_failed" })
      .eq("id", orderId);
    return {
      ok: false,
      status: 500,
      error: "Print job failed unexpectedly.",
      orderId,
    };
  }
}
