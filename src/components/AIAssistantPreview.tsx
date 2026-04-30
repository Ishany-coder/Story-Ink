"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CANVAS_SIZE,
  type ImageLayer,
  type Layer,
  type StoryPage,
  type TextLayer,
} from "@/lib/types";
import { resolveDisplayLayers } from "@/lib/layouts";
import ReadOnlyLayer from "./ReadOnlyLayer";
import { useAutoFitFontSize } from "./useAutoFitFontSize";

export type PendingText = {
  kind: "text";
  page: StoryPage;
  newText: string;
};

export type PendingImage = {
  kind: "image";
  page: StoryPage;
  newImageUrl: string;
};

// Combined preview produced by /ai/infer when the classifier (or the user's
// override) picks both text and image. Either payload may be missing if
// that side's generator failed — caller should render only what's present.
export type PendingBoth = {
  kind: "both";
  page: StoryPage;
  newText?: string;
  newImageUrl?: string;
};

export type Pending = PendingText | PendingImage | PendingBoth;

interface Props {
  pending: Pending | null;
  onApply: () => void;
  onDiscard: () => void;
  // Triggered when the user clicks "Also regenerate the [other side]"
  // from inside the modal. The panel runs an explicit text-only or
  // image-only generation with the same user prompt and merges the
  // result into the existing pending so the modal upgrades to a
  // "both" diff in place.
  onAlsoRegenerate?: (mode: "text" | "image") => void;
  // True while the panel is fetching the other side. Disables the
  // button and shows a spinner so the user can't queue duplicates.
  isExtending?: boolean;
}

export default function AIAssistantPreview({
  pending,
  onApply,
  onDiscard,
  onAlsoRegenerate,
  isExtending = false,
}: Props) {
  useEffect(() => {
    if (!pending) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDiscard();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, onDiscard]);

  if (!pending) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onDiscard}
    >
      <div
        className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl bg-cream-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-cream-300 px-6 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-ink-300">
              AI preview · page {pending.page.pageNumber}
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink-900">
              {pending.kind === "text" && "Proposed text change"}
              {pending.kind === "image" && "Proposed illustration change"}
              {pending.kind === "both" && "Proposed text + illustration change"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onDiscard}
            aria-label="Close preview"
            className="rounded-full bg-cream-200 px-3 py-1 text-sm font-black text-ink-300 hover:bg-moss-100"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-auto px-6 py-5">
          {pending.kind === "text" && <TextDiffBody pending={pending} />}
          {pending.kind === "image" && <ImageDiffBody pending={pending} />}
          {pending.kind === "both" && <BothDiffBody pending={pending} />}

          {/* Single-side regen → offer to also regenerate the other side
              with the same user prompt. The panel handles the merge so
              the modal upgrades in place to a "both" diff. */}
          {onAlsoRegenerate && pending.kind === "text" && (
            <ExtendBanner
              kind="image"
              onRun={() => onAlsoRegenerate("image")}
              loading={isExtending}
            />
          )}
          {onAlsoRegenerate && pending.kind === "image" && (
            <ExtendBanner
              kind="text"
              onRun={() => onAlsoRegenerate("text")}
              loading={isExtending}
            />
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-cream-300 bg-cream-200/40 px-6 py-4">
          <p className="text-[11px] font-bold text-ink-300">
            Apply updates this page locally. Hit &quot;Save page&quot; in the
            studio to persist.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDiscard}
              className="rounded-2xl bg-moss-100 px-5 py-2 text-sm font-black uppercase text-ink-500 transition-all hover:bg-cream-300"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={onApply}
              className="rounded-2xl bg-gradient-to-r from-emerald-500 to-green-500 px-5 py-2 text-sm font-black uppercase text-cream-50 shadow-md transition-all hover:scale-105"
            >
              Apply
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TEXT mode — two full page renders side by side. The layout text layer
// swaps between old and new text. Below, a word-level GitHub-style diff
// spells out exactly which words changed.
// ---------------------------------------------------------------------------

function TextDiffBody({ pending }: { pending: PendingText }) {
  const { page, newText } = pending;
  const layers = useMemo(() => resolveDisplayLayers(page), [page]);
  const textLayerId = useMemo(
    () => layers.find((l) => l.source === "layout" && l.type === "text")?.id,
    [layers]
  );
  const oldText = useMemo(() => {
    const tl = layers.find(
      (l) => l.source === "layout" && l.type === "text"
    ) as TextLayer | undefined;
    return tl?.text ?? page.text;
  }, [layers, page.text]);

  const ops = useMemo(() => wordDiff(oldText, newText), [oldText, newText]);
  const removed = ops.filter((o) => o.type === "del").length;
  const added = ops.filter((o) => o.type === "add").length;
  const unchanged = ops.filter((o) => o.type === "same").length;

  const beforeLayers = layers;
  const afterLayers = useMemo(
    () =>
      layers.map((l) =>
        l.id === textLayerId && l.type === "text"
          ? ({ ...l, text: newText } as TextLayer)
          : l
      ),
    [layers, textLayerId, newText]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-[11px] font-bold text-ink-300">
        <span className="rounded bg-rose-100 px-2 py-0.5 text-rose-600">
          −{removed} removed
        </span>
        <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-600">
          +{added} added
        </span>
        <span className="text-ink-300">{unchanged} unchanged</span>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <PagePanel
          label="Before"
          tone="rose"
          layers={beforeLayers}
          textHighlight={
            textLayerId
              ? { layerId: textLayerId, ops, side: "before" }
              : null
          }
        />
        <PagePanel
          label="After"
          tone="emerald"
          layers={afterLayers}
          textHighlight={
            textLayerId ? { layerId: textLayerId, ops, side: "after" } : null
          }
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// IMAGE mode — two full page renders side by side. The layout image layer
// swaps src between old and new. On top of that image layer we render a
// red diff mask (before) and green diff mask (after) computed from a
// pixel-by-pixel comparison of the two illustrations.
// ---------------------------------------------------------------------------

function ImageDiffBody({ pending }: { pending: PendingImage }) {
  const { page, newImageUrl } = pending;
  const layers = useMemo(() => resolveDisplayLayers(page), [page]);
  const imageLayerId = useMemo(
    () => layers.find((l) => l.source === "layout" && l.type === "image")?.id,
    [layers]
  );
  const oldImageUrl = useMemo(() => {
    const il = layers.find(
      (l) => l.source === "layout" && l.type === "image"
    ) as ImageLayer | undefined;
    return il?.src ?? page.imageUrl;
  }, [layers, page.imageUrl]);

  const { beforeMask, afterMask, status, changedPct } = useImageDiffMasks(
    oldImageUrl,
    newImageUrl
  );

  const beforeLayers = layers;
  const afterLayers = useMemo(
    () =>
      layers.map((l) =>
        l.id === imageLayerId && l.type === "image"
          ? ({ ...l, src: newImageUrl } as ImageLayer)
          : l
      ),
    [layers, imageLayerId, newImageUrl]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-[11px] font-bold text-ink-300">
        <span className="rounded bg-rose-100 px-2 py-0.5 text-rose-600">
          Red = leaving
        </span>
        <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-600">
          Green = new
        </span>
        {status === "ok" && changedPct != null && (
          <span className="text-ink-300">
            ~{changedPct}% of image pixels changed
          </span>
        )}
        {status === "fallback" && (
          <span className="text-amber-500">
            Diff mask unavailable (CORS) — showing the two pages without a mask.
          </span>
        )}
        {status === "error" && (
          <span className="text-rose-500">
            Couldn&apos;t load both images for the mask.
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <PagePanel
          label="Before"
          tone="rose"
          layers={beforeLayers}
          imageMask={
            imageLayerId
              ? { layerId: imageLayerId, maskUrl: beforeMask }
              : null
          }
        />
        <PagePanel
          label="After"
          tone="emerald"
          layers={afterLayers}
          imageMask={
            imageLayerId ? { layerId: imageLayerId, maskUrl: afterMask } : null
          }
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BOTH mode — stacks the text diff and the image diff so the user can review
// and apply both changes in one shot. Either side may be missing (generator
// failure for that target) — we render only what came back, and call out
// any failures inline.
// ---------------------------------------------------------------------------

function BothDiffBody({ pending }: { pending: PendingBoth }) {
  const { page, newText, newImageUrl } = pending;
  const textOk = typeof newText === "string";
  const imageOk = typeof newImageUrl === "string";

  // Refs so the table-of-contents at the top can scroll the user to
  // either section. The modal's content area is the scroll container,
  // so scrollIntoView naturally walks up to it.
  const textRef = useRef<HTMLElement>(null);
  const imageRef = useRef<HTMLElement>(null);

  function jumpTo(target: HTMLElement | null) {
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-8">
      {/* "Two parts" table of contents. Stickied to the top of the
          scroll area so the user always knows there's more below. */}
      {textOk && imageOk && (
        <div className="sticky top-0 z-10 -mx-6 -mt-5 border-b border-cream-300 bg-cream-50/95 px-6 py-3 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-ink-300">
              Two changes proposed
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => jumpTo(textRef.current)}
                className="rounded-full border border-cream-300 bg-cream-50 px-3 py-1 text-xs font-semibold text-ink-700 transition-colors hover:border-moss-500 hover:bg-cream-200"
              >
                Text change
              </button>
              <button
                type="button"
                onClick={() => jumpTo(imageRef.current)}
                className="inline-flex items-center gap-1.5 rounded-full bg-moss-700 px-3 py-1 text-xs font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
              >
                Illustration change
                <ArrowDownIcon />
              </button>
            </div>
          </div>
        </div>
      )}

      {textOk && (
        <section ref={textRef} className="space-y-3 scroll-mt-20">
          <h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-ink-900">
            Text change
          </h3>
          <TextDiffBody
            pending={{ kind: "text", page, newText: newText as string }}
          />
          {/* Visual rail pointing down to the illustration section so
              users skimming the text don't miss the second half. */}
          {imageOk && (
            <button
              type="button"
              onClick={() => jumpTo(imageRef.current)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-cream-400 bg-cream-100/60 px-4 py-3 text-xs font-semibold text-ink-500 transition-colors hover:border-moss-500 hover:text-ink-900"
            >
              <ArrowDownIcon />
              The illustration also changed — see below
            </button>
          )}
        </section>
      )}
      {!textOk && (
        <section className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-500">
          Text regeneration failed — keeping the current page text.
        </section>
      )}
      {imageOk && (
        <section ref={imageRef} className="space-y-3 scroll-mt-20">
          <h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-ink-900">
            Illustration change
          </h3>
          <ImageDiffBody
            pending={{
              kind: "image",
              page,
              newImageUrl: newImageUrl as string,
            }}
          />
        </section>
      )}
      {!imageOk && (
        <section className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-500">
          Image regeneration failed — keeping the current illustration.
        </section>
      )}
    </div>
  );
}

function ArrowDownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 1.5v11M2.5 8L7 12.5 11.5 8" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// PagePanel — a single big labelled page render.
// ---------------------------------------------------------------------------

interface PagePanelProps {
  label: "Before" | "After";
  tone: "rose" | "emerald";
  layers: Layer[];
  textHighlight?: {
    layerId: string;
    ops: DiffOp[];
    side: "before" | "after";
  } | null;
  imageMask?: { layerId: string; maskUrl: string | null } | null;
}

function PagePanel({
  label,
  tone,
  layers,
  textHighlight,
  imageMask,
}: PagePanelProps) {
  const borderCls =
    tone === "rose"
      ? "border-rose-300 shadow-rose-100"
      : "border-emerald-300 shadow-emerald-100";
  const chipCls =
    tone === "rose"
      ? "bg-rose-200 text-rose-700"
      : "bg-emerald-200 text-emerald-700";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${chipCls}`}
        >
          {label}
        </span>
      </div>
      <div
        className={`relative aspect-square w-full overflow-hidden rounded-2xl border-4 bg-gradient-to-br from-cream-100 to-cream-200 shadow-lg ${borderCls}`}
      >
        {layers.map((layer) => {
          if (
            textHighlight &&
            layer.id === textHighlight.layerId &&
            layer.type === "text"
          ) {
            return (
              <DiffTextLayer
                key={layer.id}
                layer={layer}
                ops={textHighlight.ops}
                side={textHighlight.side}
              />
            );
          }
          if (
            imageMask &&
            layer.id === imageMask.layerId &&
            layer.type === "image"
          ) {
            return (
              <MaskedImageLayer
                key={layer.id}
                layer={layer}
                maskUrl={imageMask.maskUrl}
                tone={tone}
              />
            );
          }
          return <ReadOnlyLayer key={layer.id} layer={layer} />;
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diff-aware text layer — same position/rotation/typography as the normal
// text layer, but renders each word with red (before) or green (after)
// highlighting based on the LCS diff ops. Skips AutoFitText so we can emit
// inline spans; uses the layer's stored fontSize scaled into the panel.
// ---------------------------------------------------------------------------

function DiffTextLayer({
  layer,
  ops,
  side,
}: {
  layer: TextLayer;
  ops: DiffOp[];
  side: "before" | "after";
}) {
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

  const keep = side === "before" ? "del" : "add";
  const skip = side === "before" ? "add" : "del";

  // Mirror AutoFitText: measure the container and binary-search for the
  // largest font size at which the *displayed* text fits. "Displayed" here
  // means the words this side actually renders — removed words on the
  // before side, added words on the after side.
  const displayedText = useMemo(
    () =>
      ops
        .filter((o) => o.type === "same" || o.type === keep)
        .map((o) => o.text)
        .join(""),
    [ops, keep]
  );

  const { containerRef, fontSizePx } = useAutoFitFontSize({
    text: displayedText,
    logicalWidth: layer.width,
    logicalMaxFontSize: layer.fontSize,
    fontFamily: layer.fontFamily,
    fontWeight: layer.fontWeight,
  });

  return (
    <div style={style}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            color: layer.color,
            fontFamily: layer.fontFamily,
            fontWeight: layer.fontWeight,
            lineHeight: 1.15,
            textAlign: "center",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            width: "100%",
            fontSize: `${fontSizePx}px`,
          }}
        >
          {ops.map((op, i) => {
            if (op.type === "same") return <span key={i}>{op.text}</span>;
            if (op.type === skip) return null;
            if (op.type === keep) {
              return (
                <span
                  key={i}
                  style={
                    side === "before"
                      ? {
                          background: "rgba(254, 202, 202, 0.9)",
                          color: "#881337",
                          textDecoration: "line-through",
                          textDecorationThickness: "2px",
                          borderRadius: "0.2em",
                          padding: "0 0.1em",
                        }
                      : {
                          background: "rgba(187, 247, 208, 0.9)",
                          color: "#064e3b",
                          borderRadius: "0.2em",
                          padding: "0 0.1em",
                        }
                  }
                >
                  {op.text}
                </span>
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Masked image layer — normal image render, with a tinted diff mask image
// stacked on top at the same position. The mask is already red-tinted for
// the before side and green-tinted for the after side, so we just overlay.
// ---------------------------------------------------------------------------

function MaskedImageLayer({
  layer,
  maskUrl,
  tone,
}: {
  layer: ImageLayer;
  maskUrl: string | null;
  tone: "rose" | "emerald";
}) {
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

  const fit = layer.source === "layout" ? "cover" : "contain";
  const borderCls =
    tone === "rose" ? "outline-rose-400/80" : "outline-emerald-400/80";

  return (
    <div style={style} className={`outline outline-2 ${borderCls}`}>
      <div className="relative h-full w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={layer.src}
          alt=""
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: fit,
            userSelect: "none",
          }}
        />
        {maskUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={maskUrl}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: fit,
              mixBlendMode: "normal",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExtendBanner — shown inside the diff modal when only one side was
// regenerated. The classifier sometimes downgrades to "text" (or
// "image") only; this affordance lets the user one-click also
// regenerate the missing side with the SAME user prompt. The panel
// merges the result into a single "both" pending so the user reviews
// and applies in one shot rather than running two separate flows.
// ---------------------------------------------------------------------------

function ExtendBanner({
  kind,
  onRun,
  loading,
}: {
  kind: "text" | "image";
  onRun: () => void;
  loading: boolean;
}) {
  const label =
    kind === "image" ? "Also regenerate the illustration" : "Also rewrite the text";
  const explainer =
    kind === "image"
      ? "The illustration above is unchanged. Want the AI to update it with the same instruction?"
      : "The narration above is unchanged. Want the AI to rewrite it with the same instruction?";
  return (
    <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cream-300 bg-cream-100/60 px-5 py-4">
      <div>
        <p className="text-[11px] font-black uppercase tracking-wider text-ink-300">
          One side only
        </p>
        <p className="mt-0.5 text-sm text-ink-700">{explainer}</p>
      </div>
      <button
        type="button"
        onClick={onRun}
        disabled={loading}
        className="rounded-full bg-moss-700 px-5 py-2 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Working…" : label}
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Word-level LCS diff (unchanged from prior version, kept internal here).
// ---------------------------------------------------------------------------

type DiffOp = { type: "same" | "del" | "add"; text: string };

function tokenize(s: string): string[] {
  return s.split(/(\s+)/).filter((t) => t.length > 0);
}

function wordDiff(a: string, b: string): DiffOp[] {
  const A = tokenize(a);
  const B = tokenize(b);
  const m = A.length;
  const n = B.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        A[i - 1] === B[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (A[i - 1] === B[j - 1]) {
      ops.unshift({ type: "same", text: A[i - 1] });
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.unshift({ type: "del", text: A[i - 1] });
      i -= 1;
    } else {
      ops.unshift({ type: "add", text: B[j - 1] });
      j -= 1;
    }
  }
  while (i > 0) {
    ops.unshift({ type: "del", text: A[i - 1] });
    i -= 1;
  }
  while (j > 0) {
    ops.unshift({ type: "add", text: B[j - 1] });
    j -= 1;
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Image diff masks — loads both images, computes a per-pixel absolute-diff
// mask at DIFF_SIZE, then returns two transparent PNG data URLs: one
// red-tinted (for the before side) and one green-tinted (for the after).
// ---------------------------------------------------------------------------

const DIFF_SIZE = 768;
const DIFF_THRESHOLD = 40;

function useImageDiffMasks(beforeUrl: string, afterUrl: string) {
  const [beforeMask, setBeforeMask] = useState<string | null>(null);
  const [afterMask, setAfterMask] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ok" | "fallback" | "error"
  >("loading");
  const [changedPct, setChangedPct] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    function loadImage(url: string): Promise<HTMLImageElement> {
      return new Promise((resolve, reject) => {
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`load failed: ${url}`));
        img.src = url;
      });
    }

    async function run() {
      setStatus("loading");
      setBeforeMask(null);
      setAfterMask(null);
      setChangedPct(null);
      try {
        const [imgA, imgB] = await Promise.all([
          loadImage(beforeUrl),
          loadImage(afterUrl),
        ]);
        if (cancelled) return;

        const canvasA = document.createElement("canvas");
        const canvasB = document.createElement("canvas");
        canvasA.width = canvasB.width = DIFF_SIZE;
        canvasA.height = canvasB.height = DIFF_SIZE;
        const ctxA = canvasA.getContext("2d");
        const ctxB = canvasB.getContext("2d");
        if (!ctxA || !ctxB) {
          setStatus("error");
          return;
        }
        ctxA.drawImage(imgA, 0, 0, DIFF_SIZE, DIFF_SIZE);
        ctxB.drawImage(imgB, 0, 0, DIFF_SIZE, DIFF_SIZE);

        let dataA: ImageData;
        let dataB: ImageData;
        try {
          dataA = ctxA.getImageData(0, 0, DIFF_SIZE, DIFF_SIZE);
          dataB = ctxB.getImageData(0, 0, DIFF_SIZE, DIFF_SIZE);
        } catch {
          setStatus("fallback");
          return;
        }

        const maskA = ctxA.createImageData(DIFF_SIZE, DIFF_SIZE);
        const maskB = ctxB.createImageData(DIFF_SIZE, DIFF_SIZE);
        let changed = 0;
        const total = dataA.data.length / 4;
        for (let p = 0; p < dataA.data.length; p += 4) {
          const dr = Math.abs(dataA.data[p] - dataB.data[p]);
          const dg = Math.abs(dataA.data[p + 1] - dataB.data[p + 1]);
          const db = Math.abs(dataA.data[p + 2] - dataB.data[p + 2]);
          const avg = (dr + dg + db) / 3;
          if (avg > DIFF_THRESHOLD) {
            maskA.data[p] = 239;
            maskA.data[p + 1] = 68;
            maskA.data[p + 2] = 68;
            maskA.data[p + 3] = 140;
            maskB.data[p] = 34;
            maskB.data[p + 1] = 197;
            maskB.data[p + 2] = 94;
            maskB.data[p + 3] = 140;
            changed += 1;
          }
        }

        const outA = document.createElement("canvas");
        outA.width = outA.height = DIFF_SIZE;
        outA.getContext("2d")?.putImageData(maskA, 0, 0);
        const outB = document.createElement("canvas");
        outB.width = outB.height = DIFF_SIZE;
        outB.getContext("2d")?.putImageData(maskB, 0, 0);

        if (cancelled) return;
        setBeforeMask(outA.toDataURL("image/png"));
        setAfterMask(outB.toDataURL("image/png"));
        setChangedPct(Math.round((changed / total) * 100));
        setStatus("ok");
      } catch (err) {
        console.error("image diff failed:", err);
        if (!cancelled) setStatus("error");
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [beforeUrl, afterUrl]);

  return { beforeMask, afterMask, status, changedPct };
}
