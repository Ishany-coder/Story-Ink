import {
  CANVAS_SIZE,
  type ImageLayer,
  type Layer,
  type Layout,
  type StoryPage,
  type TextLayer,
} from "./types";

export const LAYOUTS: Layout[] = [
  {
    id: "full-bleed-caption",
    name: "Full bleed + caption",
    imageRegion: { x: 0, y: 0, width: CANVAS_SIZE, height: CANVAS_SIZE },
    textRegion: { x: 40, y: 540, width: 720, height: 220 },
  },
  {
    id: "top-image-bottom-text",
    name: "Top image / bottom text",
    imageRegion: { x: 0, y: 0, width: CANVAS_SIZE, height: 520 },
    textRegion: { x: 40, y: 540, width: 720, height: 240 },
  },
  {
    id: "side-by-side",
    name: "Side by side",
    imageRegion: { x: 0, y: 0, width: 460, height: CANVAS_SIZE },
    textRegion: { x: 480, y: 40, width: 300, height: 720 },
  },
  {
    id: "corner-caption",
    name: "Corner caption",
    imageRegion: { x: 0, y: 0, width: CANVAS_SIZE, height: CANVAS_SIZE },
    textRegion: { x: 40, y: 40, width: 380, height: 160 },
  },
];

export const DEFAULT_LAYOUT_ID = LAYOUTS[0].id;

export function getLayout(id: string | undefined): Layout {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
}

// Build the layer set that should actually be shown for a page. Pages created
// before the layout system have no layout-tagged layers — synthesize them
// ephemerally from page.imageUrl + page.text so the reader and editor always
// render a consistent image + text. User-added layers pass through unchanged.
export function resolveDisplayLayers(page: StoryPage): Layer[] {
  const existing = page.overlays ?? [];
  const hasLayoutImage = existing.some(
    (l) => l.source === "layout" && l.type === "image"
  );
  const hasLayoutText = existing.some(
    (l) => l.source === "layout" && l.type === "text"
  );
  if (hasLayoutImage && hasLayoutText) return existing;

  const layout = getLayout(page.layoutId);
  const synthesized: Layer[] = [];

  if (!hasLayoutImage && page.imageUrl) {
    synthesized.push(makeLayoutImage(page.imageUrl, layout.imageRegion));
  }
  if (!hasLayoutText && page.text) {
    synthesized.push(
      makeLayoutText(page.text, computeInitialTextRegion(page.text, layout))
    );
  }

  // Layout layers render below user layers so the parent's additions stay on top.
  return [...synthesized, ...existing];
}

export function makeLayoutImage(src: string, region: import("./types").Rect): ImageLayer {
  return {
    id: `layout-image-${region.x}-${region.y}`,
    type: "image",
    src,
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
    rotation: 0,
    source: "layout",
  };
}

export function makeLayoutText(
  text: string,
  region: import("./types").Rect
): TextLayer {
  return {
    id: `layout-text-${region.x}-${region.y}`,
    type: "text",
    text,
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
    rotation: 0,
    // Acts as a cap — AutoFitText shrinks below this to fit the box, and
    // grows back up to here when the box is large enough. Kept small so
    // short captions don't look ballooned.
    fontSize: 22,
    color: "#1f1147",
    fontFamily: "var(--font-display), serif",
    fontWeight: "bold",
    source: "layout",
  };
}

// For the default (full-bleed + caption) layout, grow the caption region
// upward to accommodate long passages so the narration can render at a
// readable size without AutoFitText shrinking it into illegibility.
export function computeInitialTextRegion(
  text: string,
  layout: Layout
): import("./types").Rect {
  const base = layout.textRegion;
  if (layout.id !== "full-bleed-caption") return base;

  const len = text.length;
  // Baseline region (220 tall) holds ~150 chars comfortably at cap size.
  // Each additional ~60 chars adds one more line's worth of height.
  const extraLines = Math.max(0, Math.ceil((len - 150) / 60));
  const extraHeight = extraLines * 36;

  // Anchor to the bottom edge so the region grows upward, not past the
  // canvas. Leave a 40px top margin.
  const bottom = base.y + base.height;
  const maxHeight = bottom - 40;
  const height = Math.min(maxHeight, base.height + extraHeight);
  const y = bottom - height;
  return { x: base.x, y, width: base.width, height };
}

// Morph existing layout-tagged layers (single image, single text) into a new
// layout's regions. Non-layout layers pass through untouched. If either layer
// is missing, the layout switch still succeeds for the present one.
export function morphLayersToLayout(layers: Layer[], layout: Layout): Layer[] {
  return layers.map((l) => {
    if (l.source !== "layout") return l;
    const region =
      l.type === "image" ? layout.imageRegion : layout.textRegion;
    return {
      ...l,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      rotation: 0,
    };
  });
}

// Build the default overlays set for a freshly generated page: one layout
// image + one layout text. Used by /api/generate so the studio opens with
// everything already in place.
export function buildInitialOverlays(imageUrl: string, text: string): Layer[] {
  const layout = getLayout(DEFAULT_LAYOUT_ID);
  const textRegion = computeInitialTextRegion(text, layout);
  const overlays: Layer[] = [];
  if (imageUrl) overlays.push(makeLayoutImage(imageUrl, layout.imageRegion));
  if (text) overlays.push(makeLayoutText(text, textRegion));
  return overlays;
}
