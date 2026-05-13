import { NextResponse } from "next/server";

// GET /api/health
//
// Lightweight uptime probe. This endpoint is hit by external uptime
// monitors (UptimeRobot, BetterStack, etc.) on a tight interval —
// every 30-60s in production — so it MUST stay cheap. Do NOT add a
// database query, an outbound API ping, or anything else that could
// quietly turn the monitor into a load-generator on the dependency.
//
// We only verify that the required env vars are present and that the
// process is alive enough to compile this handler. That is enough to
// catch the most common breakage (missed env in a deploy, server
// hanging) without paying the cost of a live ping.
//
// Returns 200 with a small JSON status object when every required
// dependency is configured; 503 with the same shape when something is
// missing. The shape is stable across both response codes so monitor
// dashboards can graph the booleans over time.
//
// Required: no auth.
// Cost target: < 5ms server time, < 100 bytes wire size.

export const dynamic = "force-dynamic";
// Cap the runtime aggressively — uptime probes should never block on a
// slow handler. If this ever stops returning in <100ms we want it to
// fail the probe, not wedge it.
export const maxDuration = 5;

interface HealthReport {
  ok: boolean;
  // ISO timestamp of the response — handy for debugging clock skew on
  // monitors and for verifying the response is fresh.
  ts: string;
  supabase: "connected" | "missing-env";
  stripe: "configured" | "missing-env";
  email: "configured" | "missing-env";
  gemini: "configured" | "missing-env";
}

function present(key: string): boolean {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0;
}

export async function GET() {
  // We only check env presence. We deliberately do NOT execute a DB
  // round trip — that would put a constant query load on Supabase per
  // monitor request, and a probe failing because Supabase is slow is
  // a different signal than a probe failing because the app forgot
  // its env vars. Status-page tooling separately monitors Supabase
  // directly.
  const supabaseOk =
    present("NEXT_PUBLIC_SUPABASE_URL") &&
    present("SUPABASE_SERVICE_ROLE_KEY");
  const stripeOk =
    present("STRIPE_SECRET_KEY") && present("STRIPE_WEBHOOK_SECRET");
  const emailOk = present("RESEND_API_KEY") && present("EMAIL_FROM");
  const geminiOk = present("GEMINI_API_KEY");

  // Email is treated as required even though sendEmail() degrades to a
  // no-op without it — a production deploy that cannot send order
  // confirmation mail is a real outage even if the rest of the app
  // works. Gemini is required because story generation is the core
  // product.
  const allOk = supabaseOk && stripeOk && emailOk && geminiOk;

  const body: HealthReport = {
    ok: allOk,
    ts: new Date().toISOString(),
    supabase: supabaseOk ? "connected" : "missing-env",
    stripe: stripeOk ? "configured" : "missing-env",
    email: emailOk ? "configured" : "missing-env",
    gemini: geminiOk ? "configured" : "missing-env",
  };

  // Never cache — a stale health report is worse than no health
  // report. Some CDNs default to caching 200 JSON responses, so be
  // explicit on both directions.
  return NextResponse.json(body, {
    status: allOk ? 200 : 503,
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
