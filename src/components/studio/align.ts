// Alignment + distribution math for the Studio toolbar.
//
// Operates on bounding-box rects (we ignore rotation: aligning a rotated
// layer to "left" means its AABB's left edge — matches Canva/Figma).

import { CANVAS_SIZE, type Layer, type Rect } from "@/lib/types";
import { layerAABB, unionRect } from "./selection";

export type AlignAxis = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";
export type DistributeAxis = "horizontal" | "vertical";

// Returns a Map<id, dx/dy> describing where each layer should move so its
// bounding box aligns to `axis`. When `relativeTo` is "selection" and only
// one layer is selected, we fall back to aligning that layer to the canvas
// so the buttons stay useful with a single selection.
export function alignLayers(
  layers: Layer[],
  axis: AlignAxis,
  relativeTo: "selection" | "canvas" = "selection"
): Map<string, { x: number; y: number }> {
  const moves = new Map<string, { x: number; y: number }>();
  if (layers.length === 0) return moves;

  let bounds: Rect;
  if (relativeTo === "canvas" || layers.length < 2) {
    bounds = { x: 0, y: 0, width: CANVAS_SIZE, height: CANVAS_SIZE };
  } else {
    const u = unionRect(layers.map(layerAABB));
    if (!u) return moves;
    bounds = u;
  }

  for (const l of layers) {
    let dx = 0;
    let dy = 0;
    switch (axis) {
      case "left":
        dx = bounds.x - l.x;
        break;
      case "right":
        dx = bounds.x + bounds.width - (l.x + l.width);
        break;
      case "centerX":
        dx = bounds.x + bounds.width / 2 - (l.x + l.width / 2);
        break;
      case "top":
        dy = bounds.y - l.y;
        break;
      case "bottom":
        dy = bounds.y + bounds.height - (l.y + l.height);
        break;
      case "centerY":
        dy = bounds.y + bounds.height / 2 - (l.y + l.height / 2);
        break;
    }
    if (dx !== 0 || dy !== 0) moves.set(l.id, { x: dx, y: dy });
  }
  return moves;
}

// Equal-space distribution along an axis. With N layers, the leftmost and
// rightmost stay put; the inner N-2 slide so the gap between every pair of
// consecutive layers is the same. Returns id → (dx, dy).
//
// Works on the AABB centers along the chosen axis; layers are sorted by
// position so the user doesn't have to think about pick order.
export function distributeLayers(
  layers: Layer[],
  axis: DistributeAxis
): Map<string, { x: number; y: number }> {
  const moves = new Map<string, { x: number; y: number }>();
  if (layers.length < 3) return moves;

  const sorted = [...layers].sort((a, b) =>
    axis === "horizontal" ? a.x - b.x : a.y - b.y
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  // Spread total available "gap" space evenly. Use centers so layers of
  // different sizes still feel like they're walking on an even grid; this
  // matches Canva's "distribute centers" mode and is what users expect by
  // default.
  if (axis === "horizontal") {
    const startC = first.x + first.width / 2;
    const endC = last.x + last.width / 2;
    const step = (endC - startC) / (sorted.length - 1);
    sorted.forEach((l, i) => {
      if (i === 0 || i === sorted.length - 1) return;
      const targetC = startC + step * i;
      const dx = targetC - (l.x + l.width / 2);
      moves.set(l.id, { x: dx, y: 0 });
    });
  } else {
    const startC = first.y + first.height / 2;
    const endC = last.y + last.height / 2;
    const step = (endC - startC) / (sorted.length - 1);
    sorted.forEach((l, i) => {
      if (i === 0 || i === sorted.length - 1) return;
      const targetC = startC + step * i;
      const dy = targetC - (l.y + l.height / 2);
      moves.set(l.id, { x: 0, y: dy });
    });
  }
  return moves;
}
