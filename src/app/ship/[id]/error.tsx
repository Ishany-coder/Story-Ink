"use client";

import { useEffect } from "react";
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/legal";
import { reportError } from "@/lib/sentry";

// Per-segment error boundary for the ship/[id] flow. Customers
// reaching this surface are mid-checkout — surface a recovery path
// that doesn't lose their place if they want to try again.

export default function ShipSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, "app.ship.error-boundary");
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-6 py-20 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-moss-700">
        Checkout error
      </p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink-900">
        Couldn&rsquo;t open checkout
      </h1>
      <p className="mt-3 text-sm text-ink-500">
        You were not charged. Try again, or email us if it keeps
        happening so we can look into it.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-[10px] text-ink-300">
          Reference: {error.digest}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-moss-700 px-5 py-2 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-cream-300 px-5 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-cream-200"
        >
          Back home
        </Link>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="text-sm font-medium text-moss-700 underline hover:text-moss-900"
        >
          Email support
        </a>
      </div>
    </div>
  );
}
