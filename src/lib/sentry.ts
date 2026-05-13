// Thin wrapper around Sentry that no-ops when no DSN is configured.
//
// Both the server-side instrumentation hook (src/instrumentation.ts) and
// the client SentryInit component gate on the DSN env var. But code that
// CALLS `Sentry.captureException` doesn't know whether init succeeded —
// in dev (no DSN) we want the same call sites to still log to the
// console so operators can see the failure.
//
// reportError(err, context?) — does both: forwards to Sentry if loaded,
// always logs to console.error so dev mode still surfaces errors.
//
// The Sentry SDK is safe to import unconditionally; when not initialized,
// captureException is a no-op.

import * as Sentry from "@sentry/nextjs";

export function reportError(err: unknown, context?: string): void {
  if (context) {
    console.error(`[${context}]`, err);
  } else {
    console.error(err);
  }
  try {
    Sentry.captureException(err, context ? { tags: { context } } : undefined);
  } catch {
    // Sentry not initialized or threw — already logged to console.
  }
}
