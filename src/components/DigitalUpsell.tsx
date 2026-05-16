"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Lock } from "lucide-react";
import type { Story } from "@/lib/types";

// Locked-state reader for non-owner viewers of a story whose digital
// tier hasn't been unlocked. Shows the cover + first three pages with
// a translucent "PREVIEW" overlay, then a paywall CTA that posts to
// /api/digital/checkout.

const PREVIEW_PAGE_COUNT = 3;

export default function DigitalUpsell({
  story,
  priceUsd,
}: {
  story: Story;
  priceUsd: number;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/digital/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId: story.id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || "Checkout failed");
      }
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setPending(false);
    }
  }

  const previewPages = story.pages.slice(0, PREVIEW_PAGE_COUNT);

  return (
    <div className="animate-rise-in mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <header className="mb-6 text-center">
        <span className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
          Preview
        </span>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink-900">
          {story.title}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          The first {PREVIEW_PAGE_COUNT} pages — unlock the full story below.
        </p>
      </header>

      <div className="space-y-4">
        {previewPages.map((page, i) => (
          <div
            key={page.pageNumber}
            className="relative overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-sm"
          >
            {page.imageUrl ? (
              <div className="relative aspect-square w-full">
                {/* Preview is shown to a viewer who hasn't paid yet,
                    so we render the watermarked variant whenever one
                    exists. Falls back to the original for legacy
                    pages without a watermarked URL. */}
                <Image
                  src={page.watermarkedImageUrl || page.imageUrl}
                  alt={`Illustration for page ${page.pageNumber}${
                    page.text ? `: ${page.text.slice(0, 80)}` : ""
                  }`}
                  fill
                  sizes="(max-width: 768px) 100vw, 768px"
                  className="object-cover"
                  // Page 1 is the above-the-fold cover for an unauth
                  // visitor landing on a paid preview — prioritize it.
                  priority={i === 0}
                />
              </div>
            ) : (
              <div className="aspect-square w-full bg-cream-200" />
            )}
            {page.text && (
              <p className="px-5 py-4 text-center text-sm text-ink-700">
                {page.text}
              </p>
            )}
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              aria-hidden="true"
            >
              <span className="rotate-[-15deg] rounded-full bg-cream-50/40 px-6 py-2 text-[10px] font-bold uppercase tracking-[0.4em] text-ink-900/60 backdrop-blur-sm">
                Page {i + 1} preview
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-3xl border-4 border-dashed border-moss-700/30 bg-cream-50 p-6 text-center shadow-sm">
        <Lock className="mx-auto h-7 w-7 text-moss-700" />
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-semibold text-ink-900">
          Read the rest forever
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Unlock all {story.pages.length} pages on any device, plus a
          downloadable PDF you can save and share.
        </p>
        <button
          type="button"
          onClick={unlock}
          disabled={pending}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-moss-700 px-6 py-3 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Opening checkout…" : `Unlock for $${priceUsd.toFixed(2)}`}
        </button>
        {error && (
          <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>
        )}
        <p className="mt-4 text-[11px] text-ink-300">
          One-time purchase, no subscription. Want a printed keepsake too?{" "}
          <Link
            href={`/ship/${story.id}`}
            className="font-semibold text-moss-700 hover:text-ink-900"
          >
            Order the hardcover
          </Link>
          {" "}— digital is included free.
        </p>
      </div>
    </div>
  );
}
