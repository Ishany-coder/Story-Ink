// Postgres-backed fixed-window rate limiter.
//
// Uses the `check_rate_limit` SECURITY DEFINER function defined in
// supabase/schema.sql. The function atomically increments a counter
// keyed by an opaque string (e.g., "generate:<userId>") and resets the
// window once `windowSeconds` have elapsed since `window_start`.
//
// Fixed windows are crude (a user can fire 2× the limit at the boundary)
// but cheap, transparent, and require zero extra infrastructure beyond
// the Supabase Postgres we already run.
//
// The limiter fails OPEN — if the RPC errors we let the request through.
// Better to occasionally serve a malicious request than block a real one
// when the database hiccups.

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export interface RateLimitConfig {
  key: string;
  limit: number;
  windowSeconds: number;
}

export async function checkRateLimit(cfg: RateLimitConfig): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin().rpc("check_rate_limit", {
      p_key: cfg.key,
      p_limit: cfg.limit,
      p_window_seconds: cfg.windowSeconds,
    });
    if (error) {
      console.warn("[rate-limit] check failed, allowing:", error.message);
      return true;
    }
    return data === true;
  } catch (err) {
    console.warn("[rate-limit] rpc threw, allowing:", err);
    return true;
  }
}

// Helper that returns a 429 response if the limit is exceeded, or null
// if the caller may proceed. Route handlers can early-return the value.
export async function enforceRateLimit(
  cfg: RateLimitConfig
): Promise<NextResponse | null> {
  const ok = await checkRateLimit(cfg);
  if (ok) return null;
  return NextResponse.json(
    {
      error:
        "Rate limit exceeded. You're sending requests too fast — try again shortly.",
    },
    {
      status: 429,
      headers: {
        // Conservative retry-after. The window is configurable per call;
        // the worst-case is the full window. We surface the configured
        // window so a smart client backs off appropriately.
        "Retry-After": String(cfg.windowSeconds),
      },
    }
  );
}

// Centralized per-route limits. Tune these as we learn real usage.
//
// All limits are PER USER (or per-IP fallback) unless otherwise noted.
// They're chosen so a legitimate creator can comfortably iterate but
// a scripted attacker hits the wall before burning meaningful quota.
export const LIMITS = {
  // Full-story generation is the single most expensive endpoint
  // (1 text call + N image calls). 10/hour gives a creator room to
  // re-spin a story a few times without unlocking $30 of Gemini.
  generate: { limit: 10, windowSeconds: 60 * 60 },
  // Per-page AI Assistant edits. A creator polishing 30 pages with
  // 2 edits each = 60 calls. Cap to 120/hour for headroom.
  assist: { limit: 120, windowSeconds: 60 * 60 },
  // Single-page text regen — cheap, but still gated.
  regenText: { limit: 120, windowSeconds: 60 * 60 },
  // File uploads. Pet photos + library images. 60/hour is generous.
  upload: { limit: 60, windowSeconds: 60 * 60 },
  // Custom-layout writes — interactive, but bounded.
  customLayouts: { limit: 60, windowSeconds: 60 * 60 },
  // Payment / checkout-adjacent surfaces. Quote, Stripe checkout,
  // Stripe confirm, digital checkout. 10/min/user is plenty for a
  // real customer and cheap enough that abuse can't snowball.
  checkout: { limit: 10, windowSeconds: 60 },
  // PDF builds are CPU-bound and write to Supabase Storage. Cap at
  // 5/min/user — a creator clicking "Download PDF" twice in a row
  // is fine, a script hammering the endpoint is not.
  pdf: { limit: 5, windowSeconds: 60 },
  // Support messages. 5/hour/user — humans don't write that many
  // tickets in an hour; spammers do.
  support: { limit: 5, windowSeconds: 60 * 60 },
  // Pet creation. Slows account-signup-then-spam patterns. 10/hour
  // is more than any legitimate user needs.
  pets: { limit: 10, windowSeconds: 60 * 60 },
} as const;

// Convenience builder so call sites don't string-concat keys ad hoc.
export function userKey(scope: keyof typeof LIMITS, userId: string): string {
  return `${scope}:${userId}`;
}

// IP-key fallback used when no userId is available (unauthenticated
// flows or pre-auth probes). We SHA256 the client IP so the rate-limit
// key isn't a raw IP string sitting in the database — partial defense
// in depth in case the rate_limits table is ever exposed. Reads the
// first hop of x-forwarded-for, since deployments behind Vercel /
// Cloudflare put the real client in the leftmost position. Falls back
// to "unknown" so a request without a forwarded header still rate-
// limits as a coherent bucket rather than blowing past every cap.
export function ipKey(scope: keyof typeof LIMITS, request: Request): string {
  const raw = request.headers.get("x-forwarded-for") || "";
  const ip = raw.split(",")[0]?.trim() || "unknown";
  const hash = createHash("sha256").update(ip).digest("hex").slice(0, 24);
  return `${scope}:ip:${hash}`;
}

// Gemini daily ceiling — every text / image call increments a single
// shared counter under the "geminiGlobal:*" namespace. When the
// configured cap is hit we short-circuit the next call. Override the
// cap via GEMINI_DAILY_CAP env var; defaults to 10k/day, which keeps
// daily Gemini spend bounded to a known number while leaving plenty
// of headroom for normal traffic.
//
// One bucket per UTC day so the counter resets predictably. We don't
// rely on the fixed-window check_rate_limit RPC's auto-reset because
// a daily window straddling timezones produces confusing resets — a
// date-stamped key makes the boundary unambiguous.
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

const GEMINI_DAILY_CAP_DEFAULT = 10_000;

function geminiDailyCap(): number {
  const raw = process.env.GEMINI_DAILY_CAP;
  if (!raw) return GEMINI_DAILY_CAP_DEFAULT;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return GEMINI_DAILY_CAP_DEFAULT;
  return n;
}

// Returns true when the request may proceed, false when the daily
// ceiling has already been reached. Fail-open on RPC error (same
// philosophy as the per-user limiter) — being noisy beats being down.
export async function checkGeminiGlobalCap(): Promise<boolean> {
  const cap = geminiDailyCap();
  // 24h window so the RPC's reset semantics line up with our daily
  // budget; the date in the key still prevents drift across midnight.
  return checkRateLimit({
    key: `geminiGlobal:${todayKey()}`,
    limit: cap,
    windowSeconds: 60 * 60 * 24,
  });
}

// Throw-style guard for call sites inside the Gemini wrappers — they
// can't return a NextResponse, so we throw and let the route handler
// translate.
export class GeminiDailyCapExceededError extends Error {
  constructor() {
    super("Service paused for the day, try again tomorrow.");
    this.name = "GeminiDailyCapExceededError";
  }
}

export async function assertGeminiGlobalCap(): Promise<void> {
  const ok = await checkGeminiGlobalCap();
  if (!ok) throw new GeminiDailyCapExceededError();
}
