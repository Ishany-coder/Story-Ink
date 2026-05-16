"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type Story } from "@/lib/types";
import { resolveDisplayLayers } from "@/lib/layouts";
import { isBetaTesting } from "@/lib/beta-flag";
import ReadOnlyLayer from "./ReadOnlyLayer";

export default function SlideReader({
  story,
  fullAccess = true,
}: {
  story: Story;
  // When false, the reader swaps every layout-source background image
  // for its watermarked variant before rendering. Defaults to true so
  // existing callers that don't yet thread the prop (admin export,
  // unit tests) get clean images.
  fullAccess?: boolean;
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const pages = story.pages;

  // One-time first-run tip strip. HomeCreate appends `?fresh=1` after
  // a successful generation; we show a single dismissible cream
  // banner above the reader explaining the Studio and (outside
  // closed beta) the hardcover keepsake CTA. Initial state reads
  // the param on mount; dismissal is component-local so closing it
  // just hides for this view without touching localStorage.
  const searchParams = useSearchParams();
  const fresh = searchParams?.get("fresh") === "1";
  const [tipDismissed, setTipDismissed] = useState(false);
  const betaOn = isBetaTesting();
  const showFreshTip = fresh && !tipDismissed;

  const goNext = useCallback(() => {
    setCurrentPage((p) => Math.min(p + 1, pages.length - 1));
  }, [pages.length]);

  const goPrev = useCallback(() => {
    setCurrentPage((p) => Math.max(p - 1, 0));
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev]);

  const page = pages[currentPage];
  const rawLayers = useMemo(
    () => resolveDisplayLayers(page, story.default_text_size),
    [page, story.default_text_size]
  );
  // Swap the layout-source background image for its watermarked
  // variant when the viewer doesn't have full access. Matches by
  // exact src equality with page.imageUrl so user-inserted image
  // overlays (which carry their own src) are left alone.
  const layers = useMemo(() => {
    if (fullAccess) return rawLayers;
    const watermarked = page?.watermarkedImageUrl;
    if (!watermarked || !page?.imageUrl) return rawLayers;
    return rawLayers.map((l) =>
      l.source === "layout" && l.type === "image" && l.src === page.imageUrl
        ? { ...l, src: watermarked }
        : l
    );
  }, [rawLayers, fullAccess, page]);

  // Pin the reader to the small viewport so the entire spread (canvas
  // + arrows + page dots) fits without a page scroll. `100svh` resolves
  // to the visible viewport on mobile browsers (excluding any retracting
  // chrome). We subtract 4rem for the fixed navbar at the top of every
  // layout. The header / fresh-tip / dots rows each shrink-0; the slide
  // column flex-1s, and a ResizeObserver-driven measurement below
  // computes the exact square that fits the smaller of the column's
  // width or its remaining height (so wrapping dot rows, a beta banner,
  // and the fresh-tip strip all just-work without static guesses).
  const outerHeight = "calc(100svh - 4rem)";
  const slideRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState<number | null>(null);
  useEffect(() => {
    const el = slideRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      // 1024px = max-w-5xl (64rem). Don't grow past it so the reader
      // doesn't go absurdly large on ultrawide displays.
      setCanvasSize(Math.min(w, h, 1024));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className="flex flex-col bg-gradient-to-b from-cream-200 to-cream-100"
      style={{ height: outerHeight }}
    >
      {showFreshTip && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-cream-300 bg-cream-100 px-4 py-2 text-center text-[12px] font-medium text-ink-700 sm:px-6 lg:px-8">
          <span className="flex-1 sm:flex-none">
            Your story is ready. Want to tweak a page?{" "}
            <Link
              href={`/canvas/${story.id}`}
              className="font-semibold text-moss-700 underline decoration-moss-300 underline-offset-2 hover:text-moss-900 hover:decoration-moss-700"
            >
              Open in Studio
            </Link>{" "}
            · Reading on mobile? Pages auto-flow.
            {!betaOn && (
              <>
                {" "}· Want a hardcover keepsake?{" "}
                <Link
                  href={`/ship/${story.id}`}
                  className="font-semibold text-moss-700 underline decoration-moss-300 underline-offset-2 hover:text-moss-900 hover:decoration-moss-700"
                >
                  Order a copy
                </Link>
              </>
            )}
          </span>
          <button
            type="button"
            onClick={() => setTipDismissed(true)}
            aria-label="Dismiss tip"
            className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-ink-500 hover:bg-cream-200 hover:text-ink-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div className="grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 border-b-2 border-dashed border-cream-300 px-3 py-2 sm:gap-4 sm:px-6 sm:py-3 lg:px-8">
        <Link
          href="/read"
          className="flex items-center gap-1.5 text-sm font-bold text-ink-300 transition-colors hover:text-moss-700"
          aria-label="Back to stories"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          <span className="hidden sm:inline">Back to Stories</span>
        </Link>
        <h2 className="truncate text-center font-[family-name:var(--font-display)] text-sm font-bold text-ink-900 sm:text-base">
          {story.title}
        </h2>
        <div className="flex items-center gap-2">
          {/* Closed-beta kill switch — hide the hardcover CTA. */}
          {!isBetaTesting() && (
            <Link
              href={`/ship/${story.id}`}
              className="hidden rounded-full bg-moss-700 px-3 py-1 text-xs font-black uppercase tracking-wider text-cream-50 shadow-sm transition-all hover:scale-[1.04] sm:inline-flex"
              title="Order a physical copy"
            >
              Ship book
            </Link>
          )}
          <span className="rounded-full bg-moss-100 px-2.5 py-1 text-xs font-black text-moss-700 sm:px-3 sm:text-sm">
            {currentPage + 1} / {pages.length}
          </span>
        </div>
      </div>

      {/* Slide */}
      <div
        ref={slideRef}
        className="flex min-h-0 flex-1 items-center justify-center px-3 py-2 sm:px-4 sm:py-3"
      >
        <div
          className="relative mx-auto aspect-square"
          style={
            canvasSize != null
              ? { width: canvasSize, height: canvasSize }
              : { width: "min(100%, 1024px)" }
          }
        >
          <div className="overflow-hidden rounded-2xl border-4 border-cream-300 bg-cream-50 shadow-xl shadow-cream-200/50 sm:rounded-3xl">
            <div className="relative aspect-square w-full bg-gradient-to-br from-cream-100 to-cream-200">
              {layers.map((layer) => (
                <ReadOnlyLayer key={layer.id} layer={layer} />
              ))}
            </div>
          </div>

          {/* Arrows: sit inside the canvas on phone, outside on lg+. */}
          <button
            onClick={goPrev}
            disabled={currentPage === 0}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border-2 border-cream-400 bg-cream-50/90 p-2 text-ink-500 shadow-lg backdrop-blur-sm transition-all hover:scale-110 hover:bg-cream-200 disabled:opacity-0 sm:left-2 sm:p-3 lg:left-0 lg:-translate-x-14 lg:bg-cream-50"
            aria-label="Previous page"
          >
            <svg
              className="h-5 w-5 sm:h-6 sm:w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <button
            onClick={goNext}
            disabled={currentPage === pages.length - 1}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border-2 border-cream-400 bg-cream-50/90 p-2 text-ink-500 shadow-lg backdrop-blur-sm transition-all hover:scale-110 hover:bg-cream-200 disabled:opacity-0 sm:right-2 sm:p-3 lg:right-0 lg:translate-x-14 lg:bg-cream-50"
            aria-label="Next page"
          >
            <svg
              className="h-5 w-5 sm:h-6 sm:w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Page dots — wrap to multiple rows on phone for long stories. */}
      <div className="flex shrink-0 flex-wrap justify-center gap-2 px-3 pb-3 sm:gap-3 sm:pb-4">
        {pages.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentPage(i)}
            className={`rounded-full transition-all ${
              i === currentPage
                ? "h-3 w-8 bg-moss-500 shadow-md shadow-cream-300 sm:h-4 sm:w-10"
                : "h-3 w-3 bg-cream-300 hover:bg-cream-400 sm:h-4 sm:w-4"
            }`}
            aria-label={`Go to page ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
