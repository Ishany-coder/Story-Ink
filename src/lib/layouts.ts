import {
  CANVAS_SIZE,
  type ImageLayer,
  type Layer,
  type Layout,
  type StoryPage,
  type TextLayer,
} from "./types";

// Order matters: LAYOUTS[0] is the default for new stories (via
// DEFAULT_LAYOUT_ID) and the fallback for unknown/legacy layoutIds in
// getLayout. The Studio's Layouts tab also renders in this order, so
// the default appears first in the picker.
export const LAYOUTS: Layout[] = [
  {
    id: "top-image-bottom-text",
    name: "Top image / bottom text",
    imageRegion: { x: 0, y: 0, width: CANVAS_SIZE, height: 520 },
    textRegion: { x: 40, y: 540, width: 720, height: 240 },
  },
  {
    id: "full-bleed-caption",
    name: "Full bleed + caption",
    imageRegion: { x: 0, y: 0, width: CANVAS_SIZE, height: CANVAS_SIZE },
    textRegion: { x: 40, y: 540, width: 720, height: 220 },
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

// Built-in IDs are stable strings ("full-bleed-caption", etc.). Custom layout
// IDs are UUIDs from Supabase. Pass `customs` so the lookup can resolve those
// too — without it, a page tagged with a custom layoutId falls back silently.
export function getLayout(
  id: string | undefined,
  customs: readonly Layout[] = []
): Layout {
  return (
    LAYOUTS.find((l) => l.id === id) ??
    customs.find((l) => l.id === id) ??
    LAYOUTS[0]
  );
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

// Morph existing layout-tagged layers into a new layout's regions.
// Non-layout (user) layers pass through untouched.
//
// Multi-slot custom layouts have primary + extra image/text regions. We map
// existing layout-image layers onto image regions in order, same for text.
// When the new layout has more regions than existing layers, the extras are
// created as empty placeholders (empty src for image boxes, empty text for
// text boxes) so the user can fill them. When the new layout has fewer
// regions, the excess layout-layers are dropped — extras only live as long
// as a layout that defines them.
export function morphLayersToLayout(layers: Layer[], layout: Layout): Layer[] {
  const imageRegions = [
    layout.imageRegion,
    ...(layout.extraImageRegions ?? []),
  ];
  const textRegions = [layout.textRegion, ...(layout.extraTextRegions ?? [])];

  const layoutImages: ImageLayer[] = [];
  const layoutTexts: TextLayer[] = [];
  const userLayers: Layer[] = [];

  for (const l of layers) {
    if (l.source !== "layout") {
      userLayers.push(l);
      continue;
    }
    if (l.type === "image") layoutImages.push(l);
    else if (l.type === "text") layoutTexts.push(l);
    else userLayers.push(l);
  }

  const nextImages: ImageLayer[] = imageRegions.map((region, i) => {
    const existing = layoutImages[i];
    if (existing) {
      return {
        ...existing,
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        rotation: 0,
      };
    }
    // New slot — empty src renders as the drop-target placeholder in the
    // Studio. Dragging a thumbnail from the Images tab fills it.
    return {
      ...makeLayoutImage("", region),
      id: `layout-image-extra-${i}-${region.x}-${region.y}`,
    };
  });

  const nextTexts: TextLayer[] = textRegions.map((region, i) => {
    const existing = layoutTexts[i];
    if (existing) {
      return {
        ...existing,
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        rotation: 0,
      };
    }
    return {
      ...makeLayoutText("", region),
      id: `layout-text-extra-${i}-${region.x}-${region.y}`,
    };
  });

  // Layout layers first (render below user layers), then user layers on top.
  return [...nextImages, ...nextTexts, ...userLayers];
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
