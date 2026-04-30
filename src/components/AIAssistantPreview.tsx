"use client";

import { useEffect, useMemo } from "react";
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
// that side's generator failed — the renderer handles gracefully.
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

  // Whether the diff includes a text change, an image change, or both.
  // Drives the inline summary chips and the "Also regenerate" banner.
  const hasText = pendingHasText(pending);
  const hasImage = pendingHasImage(pending);
  const failedText = pending.kind === "both" && !hasText;
  const failedImage = pending.kind === "both" && !hasImage;

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
              {hasText && hasImage && "Proposed text + illustration change"}
              {hasText && !hasImage && "Proposed text change"}
              {!hasText && hasImage && "Proposed illustration change"}
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
          <PageDiffBody pending={pending} />

          {failedText && (
            <section className="mt-6 rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-500">
              Text regeneration failed — keeping the current page text.
            </section>
          )}
          {failedImage && (
            <section className="mt-6 rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-500">
              Image regeneration failed — keeping the current illustration.
            </section>
          )}

          {/* Single-side regen → offer to also regenerate the other
              side with the same user prompt. The panel handles the
              merge so the modal upgrades in place to a "both" diff. */}
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

function pendingHasText(p: Pending): boolean {
  if (p.kind === "text") return true;
  if (p.kind === "both") return typeof p.newText === "string";
  return false;
}
function pendingHasImage(p: Pending): boolean {
  if (p.kind === "image") return true;
  if (p.kind === "both") return typeof p.newImageUrl === "string";
  return false;
}

// ---------------------------------------------------------------------------
// PageDiffBody — single Before/After comparison handling all three pending
// shapes (text-only, image-only, both). One pair of full-page panels: the
// Before panel renders the layers as-is with red strikethroughs on removed
// words; the After panel renders with the new image src and green
// highlights on added words. No second section, no pixel-diff masks.
// ---------------------------------------------------------------------------

function PageDiffBody({ pending }: { pending: Pending }) {
  const { page } = pending;
  const newText = pendingHasText(pending)
    ? pending.kind === "text"
      ? pending.newText
      : pending.kind === "both"
      ? pending.newText
      : undefined
    : undefined;
  const newImageUrl = pendingHasImage(pending)
    ? pending.kind === "image"
      ? pending.newImageUrl
      : pending.kind === "both"
      ? pending.newImageUrl
      : undefined
    : undefined;

  const layers = useMemo(() => resolveDisplayLayers(page), [page]);
  const textLayerId = useMemo(
    () => layers.find((l) => l.source === "layout" && l.type === "text")?.id,
    [layers]
  );
  const imageLayerId = useMemo(
    () => layers.find((l) => l.source === "layout" && l.type === "image")?.id,
    [layers]
  );
  const oldText = useMemo(() => {
    const tl = layers.find(
      (l) => l.source === "layout" && l.type === "text"
    ) as TextLayer | undefined;
    return tl?.text ?? page.text;
  }, [layers, page.text]);

  // Word-level diff only when there's a text change to show.
  const ops = useMemo(
    () => (newText !== undefined ? wordDiff(oldText, newText) : null),
    [oldText, newText]
  );

  // Build the After-side layer list by patching the text layer's text
  // and/or the image layer's src in-place. Layers without changes pass
  // through, so non-layout layers (user-added stickers) keep rendering.
  const afterLayers = useMemo(() => {
    let out = layers;
    if (newText !== undefined && textLayerId) {
      out = out.map((l) =>
        l.id === textLayerId && l.type === "text"
          ? ({ ...l, text: newText } as TextLayer)
          : l
      );
    }
    if (newImageUrl !== undefined && imageLayerId) {
      out = out.map((l) =>
        l.id === imageLayerId && l.type === "image"
          ? ({ ...l, src: newImageUrl } as ImageLayer)
          : l
      );
    }
    return out;
  }, [layers, newText, newImageUrl, textLayerId, imageLayerId]);

  const removed = ops?.filter((o) => o.type === "del").length ?? 0;
  const added = ops?.filter((o) => o.type === "add").length ?? 0;
  const unchanged = ops?.filter((o) => o.type === "same").length ?? 0;

  return (
    <div className="space-y-4">
      {/* Summary chips: word counts when text changed, plus a chip for
          the illustration when it changed. Both can show together. */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-ink-300">
        {ops && (
          <>
            <span className="rounded bg-rose-100 px-2 py-0.5 text-rose-600">
              −{removed} removed
            </span>
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-600">
              +{added} added
            </span>
            <span>{unchanged} unchanged</span>
          </>
        )}
        {newImageUrl !== undefined && (
          <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-600">
            new illustration
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <PagePanel
          label="Before"
          tone="rose"
          layers={layers}
          textHighlight={
            ops && textLayerId
              ? { layerId: textLayerId, ops, side: "before" }
              : null
          }
        />
        <PagePanel
          label="After"
          tone="emerald"
          layers={afterLayers}
          textHighlight={
            ops && textLayerId
              ? { layerId: textLayerId, ops, side: "after" }
              : null
          }
        />
      </div>
    </div>
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
}

function PagePanel({ label, tone, layers, textHighlight }: PagePanelProps) {
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
