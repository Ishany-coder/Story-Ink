// Z-order helpers. Layers in `overlays` render in array order (last on
// top), so "send forward" === move toward the end, "send back" === move
// toward the beginning.

import type { Layer } from "@/lib/types";

type Op = "forward" | "backward" | "front" | "back";

export function reorderLayers(
  layers: Layer[],
  selectedIds: Set<string>,
  op: Op
): Layer[] {
  if (selectedIds.size === 0) return layers;
  const out = [...layers];
  // Indices of the selected, in current array order.
  const selectedIdx = out
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => selectedIds.has(l.id))
    .map(({ i }) => i);
  if (selectedIdx.length === 0) return out;

  if (op === "front") {
    const selected = selectedIdx.map((i) => out[i]);
    const rest = out.filter((_, i) => !selectedIdx.includes(i));
    return [...rest, ...selected];
  }
  if (op === "back") {
    const selected = selectedIdx.map((i) => out[i]);
    const rest = out.filter((_, i) => !selectedIdx.includes(i));
    return [...selected, ...rest];
  }
  if (op === "forward") {
    // Walk top→bottom so swapping doesn't compound.
    for (let i = selectedIdx.length - 1; i >= 0; i--) {
      const idx = selectedIdx[i];
      if (idx >= out.length - 1) continue;
      if (selectedIds.has(out[idx + 1].id)) continue;
      [out[idx], out[idx + 1]] = [out[idx + 1], out[idx]];
    }
    return out;
  }
  // backward
  for (let i = 0; i < selectedIdx.length; i++) {
    const idx = selectedIdx[i];
    if (idx <= 0) continue;
    if (selectedIds.has(out[idx - 1].id)) continue;
    [out[idx], out[idx - 1]] = [out[idx - 1], out[idx]];
  }
  return out;
}

// Drag-reorder helper for the Layers panel: move `fromId` so it lands at
// index `toIndex` in the new array, preserving the relative order of the
// other layers. The panel renders top→bottom = back→front (we reverse for
// display) so callers translate that visual index into the underlying
// array order before calling.
export function moveLayerToIndex(
  layers: Layer[],
  fromId: string,
  toIndex: number
): Layer[] {
  const from = layers.findIndex((l) => l.id === fromId);
  if (from < 0) return layers;
  const out = [...layers];
  const [moved] = out.splice(from, 1);
  const clampedTo = Math.max(0, Math.min(out.length, toIndex));
  out.splice(clampedTo, 0, moved);
  return out;
}
