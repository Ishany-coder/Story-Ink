"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { type Story } from "@/lib/types";
import { resolveDisplayLayers } from "@/lib/layouts";
import ReadOnlyLayer from "./ReadOnlyLayer";
import NarrationControls, {
  readStoredVoice,
  storeVoice,
} from "./NarrationControls";
import NarratorSetup from "./NarratorSetup";

export default function SlideReader({ story }: { story: Story }) {
  const [currentPage, setCurrentPage] = useState(0);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const pages = story.pages;

  // Hydrate voice from localStorage on mount. Can't be initial state because
  // localStorage isn't available during SSR.
  useEffect(() => {
    const stored = readStoredVoice();
    setVoiceId(stored.voiceId);
    setVoiceName(stored.voiceName);
  }, []);

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
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-gradient-to-b from-purple-50 to-[#fffbf5]">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-dashed border-purple-200 px-6 py-3">
        <Link
          href="/read"
          className="flex items-center gap-1.5 text-sm font-bold text-purple-400 transition-colors hover:text-purple-600"
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
        <h2 className="font-[family-name:var(--font-display)] font-bold text-purple-700">
          {story.title}
        </h2>
        <div className="flex items-center gap-2">
          <Link
            href={`/ship/${story.id}`}
            className="rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-3 py-1 text-xs font-black uppercase tracking-wider text-white shadow-sm transition-all hover:scale-[1.04]"
            title="Order a physical copy"
          >
            Ship book
          </Link>
          <span className="rounded-full bg-purple-100 px-3 py-1 text-sm font-black text-purple-600">
            {currentPage + 1} / {pages.length}
          </span>
        </div>
      </div>

      {/* Slide */}
      <div className="flex flex-1 items-center justify-center px-4 py-6">
        <div className="relative mx-auto w-full max-w-3xl">
          <div className="overflow-hidden rounded-3xl border-4 border-purple-200 bg-white shadow-xl shadow-purple-100/50">
            <div className="relative aspect-square w-full bg-gradient-to-br from-purple-50 to-pink-50">
              {layers.map((layer) => (
                <ReadOnlyLayer key={layer.id} layer={layer} />
              ))}
            </div>
          </div>

          <button
            onClick={goPrev}
            disabled={currentPage === 0}
            className="absolute left-0 top-1/2 -translate-x-14 -translate-y-1/2 rounded-full border-3 border-purple-300 bg-white p-3 text-purple-500 shadow-lg transition-all hover:scale-110 hover:bg-purple-50 disabled:opacity-0"
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
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-14 rounded-full border-3 border-purple-300 bg-white p-3 text-purple-500 shadow-lg transition-all hover:scale-110 hover:bg-purple-50 disabled:opacity-0"
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

      {/* Narration controls (voice setup + play). Rendered above the dots
          so the "Set up narrator" CTA has breathing room. */}
      <NarrationControls
        story={story}
        currentPage={currentPage}
        onAdvance={goNext}
        voiceId={voiceId}
        voiceName={voiceName}
        onOpenSetup={() => setSetupOpen(true)}
      />

      {/* Page dots */}
      <div className="flex justify-center gap-3 pb-8">
        {pages.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentPage(i)}
            className={`rounded-full transition-all ${
              i === currentPage
                ? "h-4 w-10 bg-gradient-to-r from-purple-400 to-pink-400 shadow-md shadow-purple-200"
                : "h-4 w-4 bg-purple-200 hover:bg-purple-300"
            }`}
            aria-label={`Go to page ${i + 1}`}
          />
        ))}
      </div>

      <NarratorSetup
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        existingVoiceName={voiceName}
        onCloned={(newVoiceId, newVoiceName) => {
          storeVoice(newVoiceId, newVoiceName);
          setVoiceId(newVoiceId);
          setVoiceName(newVoiceName);
          setSetupOpen(false);
        }}
      />
    </div>
  );
}

