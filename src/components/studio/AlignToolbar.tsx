"use client";

import type { AlignAxis, DistributeAxis } from "./align";

// Floating action bar that appears when 2+ layers are selected (single-
// layer selections show alignment relative to the canvas instead — the
// caller chooses).
//
// SVG icons rather than text labels — alignment is visual by nature and
// users scan the icon row instantly.

export interface AlignToolbarProps {
  onAlign: (axis: AlignAxis) => void;
  onDistribute: (axis: DistributeAxis) => void;
  // True when distribute is meaningful (3+ selected).
  canDistribute: boolean;
  // Optional: extra slots on the right for group/ungroup, z-order, etc.
  extras?: React.ReactNode;
}

export default function AlignToolbar({
  onAlign,
  onDistribute,
  canDistribute,
  extras,
}: AlignToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-linen-200 bg-paper px-1.5 py-1 shadow-sm">
      <AlignBtn title="Align left" onClick={() => onAlign("left")}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="3" x2="3" y2="21" />
          <rect x="5" y="6" width="10" height="4" />
          <rect x="5" y="14" width="14" height="4" />
        </svg>
      </AlignBtn>
      <AlignBtn title="Align horizontal center" onClick={() => onAlign("centerX")}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="3" x2="12" y2="21" />
          <rect x="7" y="6" width="10" height="4" />
          <rect x="5" y="14" width="14" height="4" />
        </svg>
      </AlignBtn>
      <AlignBtn title="Align right" onClick={() => onAlign("right")}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="21" y1="3" x2="21" y2="21" />
          <rect x="9" y="6" width="10" height="4" />
          <rect x="5" y="14" width="14" height="4" />
        </svg>
      </AlignBtn>
      <div className="mx-1 h-4 w-px bg-linen-200" aria-hidden="true" />
      <AlignBtn title="Align top" onClick={() => onAlign("top")}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="3" x2="21" y2="3" />
          <rect x="6" y="5" width="4" height="10" />
          <rect x="14" y="5" width="4" height="14" />
        </svg>
      </AlignBtn>
      <AlignBtn title="Align vertical center" onClick={() => onAlign("centerY")}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="12" x2="21" y2="12" />
          <rect x="6" y="7" width="4" height="10" />
          <rect x="14" y="5" width="4" height="14" />
        </svg>
      </AlignBtn>
      <AlignBtn title="Align bottom" onClick={() => onAlign("bottom")}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="21" x2="21" y2="21" />
          <rect x="6" y="9" width="4" height="10" />
          <rect x="14" y="5" width="4" height="14" />
        </svg>
      </AlignBtn>
      <div className="mx-1 h-4 w-px bg-linen-200" aria-hidden="true" />
      <AlignBtn
        title="Distribute horizontally"
        onClick={() => onDistribute("horizontal")}
        disabled={!canDistribute}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="6" width="4" height="12" />
          <rect x="10" y="6" width="4" height="12" />
          <rect x="17" y="6" width="4" height="12" />
        </svg>
      </AlignBtn>
      <AlignBtn
        title="Distribute vertically"
        onClick={() => onDistribute("vertical")}
        disabled={!canDistribute}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="6" y="3" width="12" height="4" />
          <rect x="6" y="10" width="12" height="4" />
          <rect x="6" y="17" width="12" height="4" />
        </svg>
      </AlignBtn>
      {extras && (
        <>
          <div className="mx-1 h-4 w-px bg-linen-200" aria-hidden="true" />
          {extras}
        </>
      )}
    </div>
  );
}

function AlignBtn({
  title,
  onClick,
  children,
  disabled,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-6 w-6 items-center justify-center rounded text-stone-500 transition-colors hover:bg-cream-100 hover:text-bark-900 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
