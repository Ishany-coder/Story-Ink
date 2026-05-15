"use client";

import { useEffect } from "react";

// Compact "?" cheatsheet popover. Triggered from a header button or by
// pressing ? on the keyboard when the canvas has focus.

interface Item {
  group: string;
  rows: Array<{ keys: string; label: string }>;
}

const ITEMS: Item[] = [
  {
    group: "Selection",
    rows: [
      { keys: "Click", label: "Select layer" },
      { keys: "⇧+Click", label: "Add to selection" },
      { keys: "Drag empty", label: "Marquee select" },
      { keys: "⌘A", label: "Select all" },
      { keys: "Esc", label: "Deselect" },
    ],
  },
  {
    group: "Move & resize",
    rows: [
      { keys: "Arrows", label: "Nudge 1 px" },
      { keys: "⇧+Arrows", label: "Nudge 10 px" },
      { keys: "⇧+Resize", label: "Aspect lock" },
      { keys: "⌥+Resize", label: "From center" },
      { keys: "⇧+Rotate", label: "15° snap" },
    ],
  },
  {
    group: "Edit",
    rows: [
      { keys: "⌘Z / ⌘⇧Z", label: "Undo / Redo" },
      { keys: "⌘C / ⌘V / ⌘X", label: "Copy / Paste / Cut" },
      { keys: "⌘D", label: "Duplicate" },
      { keys: "Del / Backspace", label: "Delete" },
      { keys: "⌘G / ⌘⇧G", label: "Group / Ungroup" },
    ],
  },
  {
    group: "Layers",
    rows: [
      { keys: "]", label: "Forward" },
      { keys: "[", label: "Backward" },
      { keys: "⌘]", label: "Bring to front" },
      { keys: "⌘[", label: "Send to back" },
      { keys: "Tab", label: "Cycle layers" },
    ],
  },
  {
    group: "View",
    rows: [
      { keys: "⌘+ / ⌘−", label: "Zoom in / out" },
      { keys: "⌘0", label: "Fit to screen" },
      { keys: "⌘F", label: "Find & replace" },
      { keys: "Double-click image", label: "Enter crop mode" },
    ],
  },
];

export default function ShortcutsHelp({
  onClose,
}: {
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-linen-200 bg-cream-50 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-linen-200 px-4 py-3">
          <h2 className="font-[family-name:var(--font-display)] text-base font-semibold text-bark-900">
            Keyboard shortcuts
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
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4 md:grid-cols-3">
          {ITEMS.map((group) => (
            <div key={group.group}>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-stone-500">
                {group.group}
              </div>
              <dl className="space-y-1">
                {group.rows.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-baseline justify-between gap-3 text-[11px]"
                  >
                    <dt className="text-bark-900">{r.label}</dt>
                    <dd className="font-mono text-[10px] text-stone-500">
                      {r.keys}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
