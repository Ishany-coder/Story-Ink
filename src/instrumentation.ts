// Next.js instrumentation hook. Runs once on server boot in both the
// Node.js runtime and the Edge runtime. We use it to wire up Sentry.
//
// Sentry stays a complete no-op when SENTRY_DSN is unset — useful for
// dev, where we don't want to ship every dev error to a hosted dashboard.
// In prod, set SENTRY_DSN in your environment to enable.
//
// See: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      // Don't auto-attach PII (IP addresses, user agent headers) by
      // default — story content is sensitive enough that we want to
      // opt in to PII collection deliberately.
      sendDefaultPii: false,
    });
  } else if (process.env.NEXT_RUNTIME === "edge") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
    });
  }
}
