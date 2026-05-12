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
// All limits are PER USER unless otherwise noted. They're chosen so a
// legitimate creator can comfortably iterate but a scripted attacker
// hits the wall before burning meaningful Gemini quota.
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
} as const;

// Convenience builder so call sites don't string-concat keys ad hoc.
export function userKey(scope: keyof typeof LIMITS, userId: string): string {
  return `${scope}:${userId}`;
}
