"use client";

import { useRef, useState } from "react";
import type { Layer } from "@/lib/types";
import { moveLayerToIndex } from "./zorder";

// Layers panel — Canva / Figma style z-order list. Renders top-to-bottom
// in visual-stacking order (top of canvas = first in list), exposes
// per-layer name editing, visibility, lock, and a drag handle for
// reordering. The "underlying" array order is back→front (last paints on
// top); this panel displays it reversed so the visible order matches the
// list order.

export interface LayersPanelProps {
  layers: Layer[];
  selectedIds: Set<string>;
  onSelect: (ids: Set<string>, additive: boolean) => void;
  onRename: (id: string, name: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onReorder: (next: Layer[]) => void;
  onDelete: (id: string) => void;
}

// Best-effort label for a layer when the user hasn't set one.
export function describeLayer(l: Layer): string {
  if (l.name) return l.name;
  if (l.type === "text") {
    const t = (l.text ?? "").trim();
    if (t.length > 0) return t.length > 32 ? t.slice(0, 32) + "…" : t;
    return "Text";
  }
  if (l.type === "shape") {
    if (l.shape === "icon" && l.iconName) return `Icon · ${l.iconName}`;
    return l.shape.charAt(0).toUpperCase() + l.shape.slice(1);
  }
  if (l.type === "image") {
    return l.src ? "Image" : "Image (empty)";
  }
  return "Layer";
}

export default function LayersPanel({
  layers,
  selectedIds,
  onSelect,
  onRename,
  onToggleVisible,
  onToggleLocked,
  onReorder,
  onDelete,
}: LayersPanelProps) {
  // Reverse a shallow copy so the visual order matches the canvas
  // stacking. We keep a parallel array of "visualIdx → underlying idx"
  // so the drag handler can translate back.
  const visual = [...layers].reverse();

  // Inline rename state.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  // Drag state for drag-reorder. We track only the source id; the drop
  // target is read from the DOM event.
  const dragSrcRef = useRef<string | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  function commitRename() {
    if (editingId == null) return;
    const trimmed = editingValue.trim();
    if (trimmed.length > 0) onRename(editingId, trimmed);
    setEditingId(null);
    setEditingValue("");
  }

  function handleDrop(targetVisualIdx: number) {
    const src = dragSrcRef.current;
    dragSrcRef.current = null;
    setDragOverIdx(null);
    if (!src) return;
    // Convert visualIdx → underlying idx by reversing.
    const underlyingTo = layers.length - targetVisualIdx - 1;
    const next = moveLayerToIndex(layers, src, underlyingTo);
    onReorder(next);
  }

  if (layers.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-[11px] text-stone-500">
        Nothing on this page yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {visual.map((l, idx) => {
        const isSelected = selectedIds.has(l.id);
        const isEditing = editingId === l.id;
        const label = describeLayer(l);
        return (
          <li
            key={l.id}
            draggable={!isEditing && !l.locked}
            onDragStart={(e) => {
              dragSrcRef.current = l.id;
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (!dragSrcRef.current) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOverIdx !== idx) setDragOverIdx(idx);
            }}
            onDragLeave={() => {
              if (dragOverIdx === idx) setDragOverIdx(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(idx);
            }}
            onDragEnd={() => {
              dragSrcRef.current = null;
              setDragOverIdx(null);
            }}
            className={`group flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] ${
              isSelected
                ? "bg-moss-100 text-bark-900"
                : "text-bark-900 hover:bg-cream-100"
            } ${dragOverIdx === idx ? "outline outline-2 outline-moss-500" : ""}`}
          >
            {/* Drag handle */}
            <span
              aria-hidden="true"
              className="cursor-grab select-none text-stone-500"
              title="Drag to reorder"
            >
              ⋮⋮
            </span>

            {/* Eye / visibility */}
            <button
              type="button"
              onClick={() => onToggleVisible(l.id)}
              title={l.hidden ? "Show" : "Hide"}
              aria-label={l.hidden ? "Show layer" : "Hide layer"}
              className="rounded p-0.5 text-stone-500 hover:bg-cream-200 hover:text-bark-900"
            >
              {l.hidden ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                  <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                  <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                  <line x1="2" y1="2" x2="22" y2="22" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>

            {/* Lock */}
            <button
              type="button"
              onClick={() => onToggleLocked(l.id)}
              title={l.locked ? "Unlock" : "Lock"}
              aria-label={l.locked ? "Unlock layer" : "Lock layer"}
              className="rounded p-0.5 text-stone-500 hover:bg-cream-200 hover:text-bark-900"
            >
              {l.locked ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </svg>
              )}
            </button>

            {/* Label / rename */}
            <button
              type="button"
              onClick={(e) =>
                onSelect(
                  new Set([l.id]),
                  e.shiftKey || e.metaKey || e.ctrlKey
                )
              }
              onDoubleClick={() => {
                setEditingId(l.id);
                setEditingValue(l.name ?? label);
              }}
              className="min-w-0 flex-1 truncate text-left"
              title="Click to select · double-click to rename"
            >
              {isEditing ? (
                <input
                  autoFocus
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") {
                      setEditingId(null);
                      setEditingValue("");
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded border border-moss-500 bg-paper px-1 py-0 text-[11px] text-bark-900 outline-none"
                />
              ) : (
                <>
                  <span className="truncate">{label}</span>
                  {l.source === "layout" && (
                    <span className="ml-1 text-stone-500">·layout</span>
                  )}
                </>
              )}
            </button>

            {/* Delete */}
            <button
              type="button"
              onClick={() => onDelete(l.id)}
              title="Delete layer"
              aria-label="Delete layer"
              className="rounded p-0.5 text-stone-500 opacity-0 hover:bg-clay-50 hover:text-clay-500 group-hover:opacity-100"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
