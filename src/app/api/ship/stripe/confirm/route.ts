import { NextResponse } from "next/server";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { retrieveCheckoutSession, unpackAddressMetadata } from "@/lib/stripe";
import { createPrintJob, LuluError } from "@/lib/lulu";
import { buildAndUploadPrintPdfs } from "@/lib/print-pdf";
import type { Story } from "@/lib/types";

// After Stripe redirects back to /ship/[id]/success?session_id=..., the
// success page hits this endpoint. We:
//  1. Verify the Checkout Session was actually paid.
//  2. Upsert a print_orders row keyed by stripe_session_id (idempotent).
//  3. If the Lulu print job hasn't been created yet, build PDFs and create
//     it. On retry (e.g. user refreshes), we find the existing row and
//     return the stored lulu_print_job_id instead of re-charging the
//     printer.
//
// This doubles as a manual "trigger-if-missed" fallback for webhook-less
// dev environments.

export const maxDuration = 120;

interface Body {
  sessionId?: unknown;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId is required" },
      { status: 400 }
    );
  }

  let session;
  try {
    session = await retrieveCheckoutSession(sessionId);
  } catch (err) {
    console.error("[stripe/confirm] retrieve failed:", err);
    return NextResponse.json(
      { error: "Stripe session not found" },
      { status: 404 }
    );
  }

  if (session.payment_status !== "paid") {
    return NextResponse.json(
      {
        error: `Session not paid yet (status: ${session.payment_status})`,
      },
      { status: 402 }
    );
  }

  const storyId = session.metadata?.story_id;
  const addressRaw = session.metadata?.address;
  if (!storyId || !addressRaw) {
    return NextResponse.json(
      { error: "Session is missing story_id / address metadata" },
      { status: 400 }
    );
  }
  const address = unpackAddressMetadata(addressRaw);
  if (!address) {
    return NextResponse.json(
      { error: "Couldn't parse address from session metadata" },
      { status: 400 }
    );
  }

  const admin = supabaseAdmin();

  // Idempotency: if we've already processed this session, return the
  // existing row. Callers hitting the success URL twice won't double-ship.
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
    return NextResponse.json({
      orderId: existing.id,
      luluJobId: existing.lulu_print_job_id,
      status: existing.status,
      alreadyProcessed: true,
    });
  }

  // Fetch the full story (for PDF generation).
  const { data: story, error: fetchErr } = await supabase
    .from("stories")
    .select("*")
    .eq("id", storyId)
    .single<Story>();
  if (fetchErr || !story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  const amountUsd =
    typeof session.amount_total === "number"
      ? session.amount_total / 100
      : null;

  // Create (or reuse) the print_orders row for this session BEFORE calling
  // Lulu so we can recover even if Lulu fails.
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
      })
      .select("id")
      .single<{ id: string }>();
    if (insertErr || !inserted) {
      console.error("[stripe/confirm] insert failed:", insertErr);
      return NextResponse.json(
        {
          error:
            "Payment succeeded but we couldn't record the order. Contact support with session id " +
            sessionId,
        },
        { status: 500 }
      );
    }
    orderId = inserted.id;
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
    console.error("[stripe/confirm] pdf build failed:", err);
    await admin
      .from("print_orders")
      .update({ status: "pdf_failed" })
      .eq("id", orderId);
    return NextResponse.json(
      { error: "PDF generation failed. We'll follow up." },
      { status: 500 }
    );
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
    return NextResponse.json({
      orderId,
      luluJobId: result.luluJobId,
      status: "printing",
    });
  } catch (err) {
    if (err instanceof LuluError) {
      console.error("[stripe/confirm] lulu error:", err);
      await admin
        .from("print_orders")
        .update({ status: "lulu_failed" })
        .eq("id", orderId);
      return NextResponse.json(
        {
          orderId,
          error:
            "Payment captured but the print job couldn't be created: " +
            err.message,
        },
        { status: 502 }
      );
    }
    console.error("[stripe/confirm] unexpected lulu error:", err);
    await admin
      .from("print_orders")
      .update({ status: "lulu_failed" })
      .eq("id", orderId);
    return NextResponse.json(
      { error: "Print job failed unexpectedly." },
      { status: 500 }
    );
  }
}
