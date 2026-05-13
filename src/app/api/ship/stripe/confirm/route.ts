import { NextResponse } from "next/server";
import { retrieveCheckoutSession } from "@/lib/stripe";
import { fulfillFromSession } from "@/lib/ship-fulfill";
import { fetchStoryOwnership, getCurrentUser } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { enforceRateLimit, LIMITS, userKey } from "@/lib/rate-limit";

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
//
// Auth: requires a signed-in user who either matches the session's
// metadata.user_id (digital) or owns the underlying story (print). An
// unauthenticated caller with a guessed/scraped cs_... session id used
// to be able to trigger PDF builds and flip digital_unlocked; this
// gate closes that hole.

export const maxDuration = 120;

interface Body {
  sessionId?: unknown;
}

export async function POST(request: Request) {
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

  // Authorize the caller against the session. Admin bypasses both
  // checks. For non-admins, require either:
  //   - session.metadata.user_id matches the caller (digital flow), OR
  //   - the caller owns the story_id named in the metadata (print flow,
  //     which doesn't always carry user_id metadata).
  const metaUserId =
    typeof session.metadata?.user_id === "string"
      ? session.metadata.user_id
      : null;
  const storyId =
    typeof session.metadata?.story_id === "string"
      ? session.metadata.story_id
      : null;

  if (!isAdminUser(user)) {
    let authorized = false;
    if (metaUserId && metaUserId === user.id) {
      authorized = true;
    } else if (storyId) {
      const ownership = await fetchStoryOwnership(storyId);
      if (ownership?.user_id === user.id) authorized = true;
    }
    if (!authorized) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }
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
    status: outcome.status,
    alreadyProcessed: outcome.alreadyProcessed,
  });
}
