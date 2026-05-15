"use client";

import { useEffect, useRef } from "react";

export interface ContextMenuItem {
  label: string;
  shortcut?: string;
  onSelect: () => void;
  // Renders the item dimmed and non-clickable. Useful for entries that
  // depend on a selection state.
  disabled?: boolean;
  // Visual separator after this item.
  separator?: boolean;
  // Indicates a destructive action — renders in clay-500.
  destructive?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

// Lightweight right-click menu. Positioned in viewport coordinates. Clamped
// to stay inside the viewport so a click near the edge doesn't open the
// menu off-screen.
export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click, Escape, or window blur.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  // Clamp x/y so the menu doesn't render off-screen. Done in a useEffect
  // so the initial render is at the requested coordinates (avoiding a
  // visible jump if the menu fits).
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const r = node.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = x;
    let ny = y;
    if (nx + r.width > vw) nx = Math.max(4, vw - r.width - 4);
    if (ny + r.height > vh) ny = Math.max(4, vh - r.height - 4);
    node.style.left = `${nx}px`;
    node.style.top = `${ny}px`;
  }, [x, y]);

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-[200px] rounded-lg border border-linen-200 bg-paper p-1 shadow-[0_18px_40px_rgba(30,20,10,.18)]"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => (
        <div key={i}>
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect();
              onClose();
            }}
            className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors ${
              item.disabled
                ? "cursor-not-allowed text-stone-500/50"
                : item.destructive
                ? "text-clay-500 hover:bg-clay-50"
                : "text-bark-900 hover:bg-cream-100"
            }`}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="ml-6 text-[10px] uppercase tracking-wide text-stone-500">
                {item.shortcut}
              </span>
            )}
          </button>
          {item.separator && (
            <div className="my-1 h-px bg-linen-200" aria-hidden="true" />
          )}
        </div>
      ))}
    </div>
  );
}
