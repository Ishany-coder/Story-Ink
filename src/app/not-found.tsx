import Link from "next/link";

// Branded 404. Reachable via notFound() from any server component
// or when no segment matches the URL.

export const metadata = {
  title: "Not found — StoryInk",
};

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-6 py-20 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-moss-700">
        404
      </p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-semibold text-ink-900">
        That page wandered off
      </h1>
      <p className="mt-3 text-sm text-ink-500">
        We couldn&rsquo;t find what you were looking for. The link may be
        stale, or the page may have been moved.
      </p>
      <div className="mt-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full bg-moss-700 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}
