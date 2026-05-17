"use client";

import { useEffect } from "react";
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/legal";
import { reportError } from "@/lib/sentry";

// Per-segment error boundary for the reader. If the story page
// failed to render, the customer's most useful action is usually to
// retry — the story is already generated, this is just a load
// failure.

export default function ReadSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, "app.read.error-boundary");
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-6 py-20 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-moss-700">
        Reader error
      </p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink-900">
        Couldn&rsquo;t load your story
      </h1>
      <p className="mt-3 text-sm text-ink-500">
        Your story is safe — we just couldn&rsquo;t open it this time.
        Try reloading; if it keeps happening, let us know.
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
          className="inline-flex items-center gap-1.5 rounded-full bg-moss-700 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full border border-cream-300 bg-cream-50 px-5 py-2.5 text-sm font-semibold text-ink-700 shadow-sm transition-colors hover:bg-cream-100 hover:border-cream-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2 disabled:opacity-50"
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
