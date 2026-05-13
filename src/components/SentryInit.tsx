"use client";

import { useEffect } from "react";

// Client-side Sentry bootstrap. Only initializes if
// NEXT_PUBLIC_SENTRY_DSN is set. Otherwise it's a complete no-op —
// nothing imports the SDK at runtime in the browser.
//
// Session replay is intentionally NOT enabled by default. If we ever
// turn replay on, gate it through hasCookieConsent() (see
// src/components/CookieConsent.tsx) so we don't capture session video
// without consent.

export default function SentryInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    let cancelled = false;
    (async () => {
      try {
        const Sentry = await import("@sentry/nextjs");
        if (cancelled) return;
        Sentry.init({
          dsn,
          tracesSampleRate: 0.1,
          sendDefaultPii: false,
          // Replay disabled until cookie consent UX is wired through.
        });
      } catch (err) {
        console.warn("[sentry] client init failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
