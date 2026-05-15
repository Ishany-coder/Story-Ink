// In-memory clipboard for the Studio. Single module-scoped slot so cut /
// copy / paste operations share state across the editor instance without
// hitting the platform clipboard (which would round-trip through JSON.
// stringify and lose typed Layer guarantees).

import type { Layer } from "@/lib/types";

let buffer: Layer[] | null = null;
// Counts the number of pastes since the last copy/cut so each paste lands
// a little further down-right and doesn't stack on the original.
let pasteCount = 0;

export function copyLayers(layers: Layer[]): void {
  if (!layers.length) return;
  // Deep-ish clone — overlays are JSON-serializable so a structuredClone
  // round-trip is correct and isolates the buffer from later edits.
  buffer = JSON.parse(JSON.stringify(layers)) as Layer[];
  pasteCount = 0;
}

export function hasClipboard(): boolean {
  return !!buffer && buffer.length > 0;
}

// Produce fresh Layer objects with new ids, offset PASTE_OFFSET px from the
// last paste. Returns null if the clipboard is empty.
export function pasteLayers(uid: () => string): Layer[] | null {
  if (!buffer || buffer.length === 0) return null;
  pasteCount += 1;
  const PASTE_OFFSET = 20;
  const dx = PASTE_OFFSET * pasteCount;
  const dy = PASTE_OFFSET * pasteCount;
  // Map old groupId → new groupId so a pasted multi-layer group stays a
  // group (with a fresh id) instead of merging with the source.
  const groupMap = new Map<string, string>();
  return buffer.map((l) => {
    const newLayer: Layer = JSON.parse(JSON.stringify(l));
    newLayer.id = uid();
    newLayer.x = l.x + dx;
    newLayer.y = l.y + dy;
    newLayer.source = "user";
    // Locked/hidden flags don't survive a paste — pasting is itself an
    // intentional act, the result should be ready to manipulate.
    delete newLayer.locked;
    delete newLayer.hidden;
    if (l.groupId) {
      let mapped = groupMap.get(l.groupId);
      if (!mapped) {
        mapped = uid();
        groupMap.set(l.groupId, mapped);
      }
      newLayer.groupId = mapped;
    }
    return newLayer;
  });
}

// Duplicate is paste-without-using-the-clipboard. Used by ⌘D so the user
// can duplicate without clobbering whatever's in their clipboard.
export function duplicateLayers(
  layers: Layer[],
  uid: () => string
): Layer[] {
  const groupMap = new Map<string, string>();
  return layers.map((l) => {
    const dup: Layer = JSON.parse(JSON.stringify(l));
    dup.id = uid();
    dup.x = l.x + 20;
    dup.y = l.y + 20;
    dup.source = "user";
    delete dup.locked;
    delete dup.hidden;
    if (l.groupId) {
      let mapped = groupMap.get(l.groupId);
      if (!mapped) {
        mapped = uid();
        groupMap.set(l.groupId, mapped);
      }
      dup.groupId = mapped;
    }
    return dup;
  });
}

// Called by tests or by a routing change that should reset the clipboard.
export function clearClipboard(): void {
  buffer = null;
  pasteCount = 0;
}
