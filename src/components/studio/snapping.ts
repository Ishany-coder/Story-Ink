// Smart-alignment snapping for drag/move operations.
//
// During a drag we compute candidate snap targets (other layers' edges +
// centers, plus the canvas edges + center) and pick the nearest one within
// SNAP_PX. The caller applies the returned delta and renders guide lines
// at the snapped coordinates.
//
// All math is in canvas-logical pixels (CANVAS_SIZE space). Snap threshold
// is also in logical units so it stays consistent regardless of zoom.

import { CANVAS_SIZE, type Layer, type Rect } from "@/lib/types";

// How close (in logical px) two edges need to be to snap together. Sized so
// most casual moves snap reliably without feeling sticky.
export const SNAP_PX = 6;

export interface SnapGuide {
  // "x" = vertical line at this x; "y" = horizontal line at this y.
  axis: "x" | "y";
  // The position the guide line is drawn at (logical px).
  position: number;
  // For visual emphasis: the layer this guide is anchored to (if any).
  // Undefined means the canvas itself.
  anchorId?: string;
}

export interface SnapResult {
  dx: number; // delta applied to the moving rect along x to snap
  dy: number; // delta applied to the moving rect along y to snap
  guides: SnapGuide[];
}

interface SnapCandidate {
  // Distance from candidate to nearest moving edge along this axis.
  delta: number;
  guide: SnapGuide;
}

// Internal: project a rect to its three "interesting" coordinates along one
// axis: the two edges and the center.
function trio(start: number, length: number): [number, number, number] {
  return [start, start + length / 2, start + length];
}

// Build the list of snap targets from the static layers (everything not
// being dragged) plus the canvas edges + center.
function buildTargets(staticLayers: Layer[]): {
  xs: { value: number; anchorId?: string }[];
  ys: { value: number; anchorId?: string }[];
} {
  const xs: { value: number; anchorId?: string }[] = [
    { value: 0 },
    { value: CANVAS_SIZE / 2 },
    { value: CANVAS_SIZE },
  ];
  const ys: { value: number; anchorId?: string }[] = [
    { value: 0 },
    { value: CANVAS_SIZE / 2 },
    { value: CANVAS_SIZE },
  ];
  for (const l of staticLayers) {
    const [lx, cx, rx] = trio(l.x, l.width);
    const [ly, cy, ry] = trio(l.y, l.height);
    xs.push({ value: lx, anchorId: l.id });
    xs.push({ value: cx, anchorId: l.id });
    xs.push({ value: rx, anchorId: l.id });
    ys.push({ value: ly, anchorId: l.id });
    ys.push({ value: cy, anchorId: l.id });
    ys.push({ value: ry, anchorId: l.id });
  }
  return { xs, ys };
}

// Find the best snap (smallest absolute distance) for the moving rect's
// three x-coordinates against the target xs. Returns the delta that, when
// applied to the moving rect's x, lines it up with the closest target.
function pickAxis(
  moving: [number, number, number],
  targets: { value: number; anchorId?: string }[]
): SnapCandidate | null {
  let best: SnapCandidate | null = null;
  for (let i = 0; i < moving.length; i++) {
    for (const t of targets) {
      const delta = t.value - moving[i];
      if (Math.abs(delta) > SNAP_PX) continue;
      if (best === null || Math.abs(delta) < Math.abs(best.delta)) {
        best = {
          delta,
          guide: {
            axis: i === 0 || i === 2 ? "x" : "x",
            position: t.value,
            anchorId: t.anchorId,
          },
        };
      }
    }
  }
  return best;
}

// Top-level snap query. Pass the rect being dragged ("moving") and the
// other layers (everything else on the page). Returns the deltas + guide
// lines to render.
export function computeSnap(
  moving: Rect,
  staticLayers: Layer[]
): SnapResult {
  const targets = buildTargets(staticLayers);
  const movX = trio(moving.x, moving.width);
  const movY = trio(moving.y, moving.height);

  const bestX = pickAxis(movX, targets.xs);
  const bestY = (() => {
    let best: SnapCandidate | null = null;
    for (let i = 0; i < movY.length; i++) {
      for (const t of targets.ys) {
        const delta = t.value - movY[i];
        if (Math.abs(delta) > SNAP_PX) continue;
        if (best === null || Math.abs(delta) < Math.abs(best.delta)) {
          best = {
            delta,
            guide: { axis: "y", position: t.value, anchorId: t.anchorId },
          };
        }
      }
    }
    return best;
  })();

  const guides: SnapGuide[] = [];
  if (bestX) guides.push(bestX.guide);
  if (bestY) guides.push(bestY.guide);
  return {
    dx: bestX?.delta ?? 0,
    dy: bestY?.delta ?? 0,
    guides,
  };
}

// Helper to also build a Rect from a layer for the snap query.
export function snapForDrag(
  movingLayer: Layer,
  proposedX: number,
  proposedY: number,
  otherLayers: Layer[]
): SnapResult {
  return computeSnap(
    {
      x: proposedX,
      y: proposedY,
      width: movingLayer.width,
      height: movingLayer.height,
    },
    otherLayers.filter((l) => l.id !== movingLayer.id)
  );
}

// Snap a bounding box (multi-selection move) against static layers.
export function snapForGroupDrag(
  bounds: Rect,
  otherLayers: Layer[]
): SnapResult {
  return computeSnap(bounds, otherLayers);
}
