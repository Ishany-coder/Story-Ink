// Multi-selection + layer geometry utilities for the Studio.
//
// All coordinates are in canvas-logical pixels (CANVAS_SIZE space).

import type { Layer, Rect } from "@/lib/types";

// AABB for a layer, ignoring rotation. We use this for marquee selection
// and alignment math; selection visuals also draw against the AABB so
// rotated layers reuse the same bounding logic.
export function layerAABB(l: Layer): Rect {
  return { x: l.x, y: l.y, width: l.width, height: l.height };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

// Union AABB of an arbitrary set of rects.
export function unionRect(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const r of rects) {
    if (r.x < x0) x0 = r.x;
    if (r.y < y0) y0 = r.y;
    if (r.x + r.width > x1) x1 = r.x + r.width;
    if (r.y + r.height > y1) y1 = r.y + r.height;
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// Resolve any layer ids that should also be selected because they share a
// group with one of the inputs. Layers without a groupId are pass-through.
export function expandToGroups(
  layers: Layer[],
  ids: Iterable<string>
): Set<string> {
  const out = new Set<string>(ids);
  const groupIds = new Set<string>();
  for (const l of layers) {
    if (out.has(l.id) && l.groupId) groupIds.add(l.groupId);
  }
  if (groupIds.size === 0) return out;
  for (const l of layers) {
    if (l.groupId && groupIds.has(l.groupId)) out.add(l.id);
  }
  return out;
}

// Pull the subset of layers in a stable order by id.
export function pickLayers(layers: Layer[], ids: Set<string>): Layer[] {
  return layers.filter((l) => ids.has(l.id));
}

// True if every id corresponds to a layer that is not locked / hidden /
// layout-bound in a way that should be unselectable.
export function isLayerSelectable(l: Layer): boolean {
  if (l.locked) return false;
  if (l.hidden) return false;
  return true;
}
