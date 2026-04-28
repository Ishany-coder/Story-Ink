"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { type Story } from "@/lib/types";
import { resolveDisplayLayers } from "@/lib/layouts";
import ReadOnlyLayer from "./ReadOnlyLayer";

export default function SlideReader({ story }: { story: Story }) {
  const [currentPage, setCurrentPage] = useState(0);
  const pages = story.pages;

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
  const layers = useMemo(() => resolveDisplayLayers(page), [page]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-gradient-to-b from-cream-200 to-cream-100">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-dashed border-cream-300 px-6 py-3">
        <Link
          href="/read"
          className="flex items-center gap-1.5 text-sm font-bold text-ink-300 transition-colors hover:text-moss-700"
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
          Back to Stories
        </Link>
        <h2 className="font-[family-name:var(--font-display)] font-bold text-ink-900">
          {story.title}
        </h2>
        <div className="flex items-center gap-2">
          <Link
            href={`/ship/${story.id}`}
            className="rounded-full bg-moss-700 px-3 py-1 text-xs font-black uppercase tracking-wider text-cream-50 shadow-sm transition-all hover:scale-[1.04]"
            title="Order a physical copy"
          >
            Ship book
          </Link>
          <span className="rounded-full bg-moss-100 px-3 py-1 text-sm font-black text-moss-700">
            {currentPage + 1} / {pages.length}
          </span>
        </div>
      </div>

      {/* Slide */}
      <div className="flex flex-1 items-center justify-center px-4 py-6">
        <div className="relative mx-auto w-full max-w-3xl">
          <div className="overflow-hidden rounded-3xl border-4 border-cream-300 bg-cream-50 shadow-xl shadow-cream-200/50">
            <div className="relative aspect-square w-full bg-gradient-to-br from-cream-100 to-cream-200">
              {layers.map((layer) => (
                <ReadOnlyLayer key={layer.id} layer={layer} />
              ))}
            </div>
          </div>

          <button
            onClick={goPrev}
            disabled={currentPage === 0}
            className="absolute left-0 top-1/2 -translate-x-14 -translate-y-1/2 rounded-full border-3 border-cream-400 bg-cream-50 p-3 text-ink-500 shadow-lg transition-all hover:scale-110 hover:bg-cream-200 disabled:opacity-0"
            aria-label="Previous page"
          >
            <svg
              className="h-6 w-6"
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
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-14 rounded-full border-3 border-cream-400 bg-cream-50 p-3 text-ink-500 shadow-lg transition-all hover:scale-110 hover:bg-cream-200 disabled:opacity-0"
            aria-label="Next page"
          >
            <svg
              className="h-6 w-6"
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

      {/* Page dots */}
      <div className="flex justify-center gap-3 pb-8">
        {pages.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentPage(i)}
            className={`rounded-full transition-all ${
              i === currentPage
                ? "h-4 w-10 bg-moss-500 shadow-md shadow-cream-300"
                : "h-4 w-4 bg-cream-300 hover:bg-cream-400"
            }`}
            aria-label={`Go to page ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
