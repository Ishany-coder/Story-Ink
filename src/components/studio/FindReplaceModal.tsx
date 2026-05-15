"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Layer, StoryPage, TextLayer } from "@/lib/types";

// Find & replace text across every page of the story. Walks each page's
// `overlays`, looking at text layers (both `layout`-source captions and
// user-added text). Reports back a flat list of matches the caller can
// jump to + an apply function that produces the replaced pages.

interface Match {
  pageNumber: number;
  pageIndex: number;
  layerId: string;
  // Character range inside the layer's text.
  start: number;
  end: number;
  // Preview slice (the surrounding context, ±20 chars).
  preview: string;
}

export interface FindReplaceModalProps {
  pages: StoryPage[];
  onClose: () => void;
  onJump: (pageIndex: number, layerId: string) => void;
  // Apply a new value to every page touched. The caller is expected to
  // route this through its page-mutator + snapshotter so the operation
  // is one undo step.
  onApplyAll: (updates: Array<{ pageNumber: number; overlays: Layer[] }>) => void;
}

export default function FindReplaceModal({
  pages,
  onClose,
  onJump,
  onApplyAll,
}: FindReplaceModalProps) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const findRef = useRef<HTMLInputElement>(null);

  // Focus the find input on open.
  useEffect(() => {
    findRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const matches = useMemo<Match[]>(() => {
    if (!find) return [];
    const out: Match[] = [];
    const needle = caseSensitive ? find : find.toLowerCase();
    pages.forEach((page, pageIndex) => {
      for (const l of page.overlays ?? []) {
        if (l.type !== "text") continue;
        const text = l.text ?? "";
        const haystack = caseSensitive ? text : text.toLowerCase();
        let i = haystack.indexOf(needle);
        while (i >= 0) {
          const end = i + find.length;
          out.push({
            pageNumber: page.pageNumber,
            pageIndex,
            layerId: l.id,
            start: i,
            end,
            preview: text.slice(Math.max(0, i - 20), end + 20),
          });
          i = haystack.indexOf(needle, end);
        }
      }
    });
    return out;
  }, [pages, find, caseSensitive]);

  function applyAll() {
    if (!find) return;
    const updates: Array<{ pageNumber: number; overlays: Layer[] }> = [];
    for (const page of pages) {
      const overlays = page.overlays ?? [];
      let changed = false;
      const next = overlays.map((l) => {
        if (l.type !== "text") return l;
        const text = l.text ?? "";
        const haystack = caseSensitive ? text : text.toLowerCase();
        const needle = caseSensitive ? find : find.toLowerCase();
        if (!haystack.includes(needle)) return l;
        // Reconstruct the original text using indices found in the
        // lowercased haystack so we don't accidentally lose case in
        // non-matching segments.
        let result = "";
        let idx = 0;
        while (idx < text.length) {
          const found = haystack.indexOf(needle, idx);
          if (found < 0) {
            result += text.slice(idx);
            break;
          }
          result += text.slice(idx, found) + replace;
          idx = found + needle.length;
        }
        changed = true;
        return { ...l, text: result } satisfies TextLayer;
      });
      if (changed) updates.push({ pageNumber: page.pageNumber, overlays: next });
    }
    if (updates.length > 0) onApplyAll(updates);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 p-4 pt-24 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-linen-200 bg-cream-50 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-linen-200 px-4 py-3">
          <h2 className="font-[family-name:var(--font-display)] text-base font-semibold text-bark-900">
            Find &amp; replace
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-lg leading-none text-stone-500 hover:text-bark-900"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="space-y-3 px-4 py-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-stone-500">
              Find
            </label>
            <input
              ref={findRef}
              value={find}
              onChange={(e) => setFind(e.target.value)}
              className="mt-1 w-full rounded-lg border border-linen-200 bg-paper px-2.5 py-1.5 text-sm text-bark-900 outline-none focus:border-moss-500"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-stone-500">
              Replace with
            </label>
            <input
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
              className="mt-1 w-full rounded-lg border border-linen-200 bg-paper px-2.5 py-1.5 text-sm text-bark-900 outline-none focus:border-moss-500"
            />
          </div>
          <label className="flex items-center gap-2 text-[12px] text-stone-500">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
            />
            Case sensitive
          </label>
          <div className="flex justify-between text-[11px] text-stone-500">
            <span>
              {find ? `${matches.length} match${matches.length === 1 ? "" : "es"}` : "Type to search"}
            </span>
          </div>
          {matches.length > 0 && (
            <ul className="max-h-48 overflow-y-auto rounded-lg border border-linen-200 bg-paper">
              {matches.slice(0, 50).map((m, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => onJump(m.pageIndex, m.layerId)}
                    className="flex w-full items-baseline justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] text-bark-900 hover:bg-cream-100"
                  >
                    <span className="truncate">{m.preview}</span>
                    <span className="shrink-0 text-stone-500">
                      p.{m.pageNumber}
                    </span>
                  </button>
                </li>
              ))}
              {matches.length > 50 && (
                <li className="px-2.5 py-1.5 text-[10px] text-stone-500">
                  …and {matches.length - 50} more
                </li>
              )}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-linen-200 bg-paper px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-linen-200 bg-paper px-3 py-1.5 text-[12px] font-medium text-bark-900 hover:bg-cream-100"
          >
            Close
          </button>
          <button
            type="button"
            onClick={applyAll}
            disabled={!find || matches.length === 0}
            className="rounded-lg bg-moss-700 px-3 py-1.5 text-[12px] font-semibold text-cream-50 hover:bg-moss-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Replace all
          </button>
        </div>
      </div>
    </div>
  );
}
