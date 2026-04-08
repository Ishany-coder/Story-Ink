"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  CANVAS_SIZE,
  type ImageLayer,
  type Layer,
  type ShapeLayer,
  type Story,
  type TextLayer,
} from "@/lib/types";

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
        <span className="rounded-full bg-purple-100 px-3 py-1 text-sm font-black text-purple-600">
          {currentPage + 1} / {pages.length}
        </span>
      </div>

      {/* Slide */}
      <div className="flex flex-1 items-center justify-center px-4 py-6">
        <div className="relative mx-auto w-full max-w-3xl">
          <div className="overflow-hidden rounded-3xl border-4 border-purple-200 bg-white shadow-xl shadow-purple-100/50">
            {/* Image + overlays. Square aspect matches the canvas editor's
                logical coordinate space, so overlays line up exactly. */}
            <div className="relative aspect-square w-full bg-gradient-to-br from-purple-50 to-pink-50">
              {(page.cleanImageUrl || page.imageUrl) ? (
                <Image
                  src={page.cleanImageUrl || page.imageUrl}
                  alt={`Page ${page.pageNumber}`}
                  fill
                  className="object-cover"
                  unoptimized
                  priority
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <span className="text-6xl">&#127912;</span>
                </div>
              )}
              {(page.overlays ?? []).map((layer) => (
                <ReadOnlyLayer key={layer.id} layer={layer} />
              ))}
            </div>

            {/* Text */}
            <div className="bg-gradient-to-b from-white to-purple-50/30 px-8 py-6 sm:px-10 sm:py-8">
              <p className="font-[family-name:var(--font-display)] text-lg leading-relaxed text-purple-800 sm:text-xl">
                {page.text}
              </p>
            </div>
          </div>

          {/* Navigation buttons */}
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
    </div>
  );
}

// Read-only render of a single overlay layer. Mirrors the editor's
// percentage-based positioning so coordinates round-trip exactly.
function ReadOnlyLayer({ layer }: { layer: Layer }) {
  const style: React.CSSProperties = {
    position: "absolute",
    left: `${(layer.x / CANVAS_SIZE) * 100}%`,
    top: `${(layer.y / CANVAS_SIZE) * 100}%`,
    width: `${(layer.width / CANVAS_SIZE) * 100}%`,
    height: `${(layer.height / CANVAS_SIZE) * 100}%`,
    transform: `rotate(${layer.rotation}deg)`,
    transformOrigin: "center center",
    pointerEvents: "none",
  };

  if (layer.type === "text") {
    const t = layer as TextLayer;
    return (
      <div style={style}>
        <div
          style={{
            width: "100%",
            height: "100%",
            color: t.color,
            fontFamily: t.fontFamily,
            fontWeight: t.fontWeight,
            fontSize: `${(t.fontSize / CANVAS_SIZE) * 100}cqw`,
            lineHeight: 1.1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            containerType: "inline-size",
            wordBreak: "break-word",
          }}
        >
          {t.text}
        </div>
      </div>
    );
  }

  if (layer.type === "shape") {
    const s = layer as ShapeLayer;
    const inner: React.CSSProperties = {
      width: "100%",
      height: "100%",
      background: s.shape === "line" ? s.stroke : s.fill,
      border:
        s.shape === "line"
          ? "none"
          : `${s.strokeWidth}px solid ${s.stroke}`,
      borderRadius:
        s.shape === "circle" ? "50%" : s.shape === "line" ? 999 : 12,
    };
    return (
      <div style={style}>
        <div style={inner} />
      </div>
    );
  }

  // image
  const im = layer as ImageLayer;
  return (
    <div style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={im.src}
        alt=""
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          userSelect: "none",
        }}
      />
    </div>
  );
}
