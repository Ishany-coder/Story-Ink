import { NextResponse } from "next/server";
import { retrieveCheckoutSession } from "@/lib/stripe";
import { fulfillFromSession } from "@/lib/ship-fulfill";

// Opportunistic confirm endpoint hit by /ship/[id]/success?session_id=...
//
// In production the Stripe webhook at /api/ship/stripe/webhook is the
// authoritative trigger for fulfillment. This route is a safety net that
// also runs fulfillment so:
//   - local dev without a webhook forwarder still works
//   - the success page can display a concrete status instead of a
//     "check back later" placeholder
//
// Both paths share `fulfillFromSession`, which is idempotent on
// stripe_session_id + atomic on the status transition — calling it from
// both routes concurrently can't double-ship.

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

  const outcome = await fulfillFromSession(session);
  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.error, orderId: outcome.orderId },
      { status: outcome.status }
    );
  }
  return NextResponse.json({
    orderId: outcome.orderId,
    luluJobId: outcome.luluJobId,
    status: outcome.status,
    alreadyProcessed: outcome.alreadyProcessed,
  });
}
