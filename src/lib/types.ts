// ---------------------------------------------------------------------------
// Canvas overlay layer types (Canva-style editor)
// ---------------------------------------------------------------------------

// "layout" = placed and controlled by a preset layout (image + text regions).
// "user"   = added manually by the parent (extra text, shape, uploaded image).
// Legacy layers without a source are treated as "user" on read.
export type LayerSource = "layout" | "user";

export type LayerBase = {
  id: string;
  // Coordinates are in canvas-logical pixels (CANVAS_SIZE x CANVAS_SIZE).
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  source?: LayerSource;
};

export type TextLayer = LayerBase & {
  type: "text";
  text: string;
  fontSize: number;
  color: string;
  fontFamily: string;
  fontWeight: "normal" | "bold";
};

export type ShapeKind = "rect" | "circle" | "line" | "icon" | "path";

export type ShapeLayer = LayerBase & {
  type: "shape";
  shape: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  // Present only when shape === "icon": a Lucide icon name
  // (e.g., "star", "heart", "cake-slice").
  iconName?: string;
  // Present only when shape === "path": the inner SVG markup (children of
  // the root <svg>) from a user-uploaded SVG, plus its viewBox so the
  // artwork scales into the layer's box.
  svgMarkup?: string;
  viewBox?: string;
};

export type ImageLayer = LayerBase & {
  type: "image";
  src: string;
  // How the image sits in its box. Defaults: layout-source -> "cover" (fill
  // and crop), user-source -> "contain" (letterbox). Empty "add image box"
  // slots override to "cover" so a dropped image visibly fills the frame.
  fit?: "cover" | "contain";
};

export type Layer = TextLayer | ShapeLayer | ImageLayer;

// ---------------------------------------------------------------------------
// Layout presets (image + text regions)
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layout {
  id: string;
  name: string;
  // Primary regions — always present. Built-in layouts have just these.
  imageRegion: Rect;
  textRegion: Rect;
  // Additional regions for multi-slot custom layouts. Each extra becomes an
  // empty layout-tagged box (image or text) on the page when the layout is
  // applied, which the user can then fill via drag-drop or inline edit.
  extraImageRegions?: Rect[];
  extraTextRegions?: Rect[];
}

// User-defined layouts loaded from the custom_layouts table. scope="global"
// means the row has story_id=null and shows for every story; scope="story"
// is scoped to storyId and only shows in that story's picker.
export interface CustomLayout extends Layout {
  scope: "global" | "story";
  storyId?: string;
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Story types
// ---------------------------------------------------------------------------

export interface StoryPage {
  pageNumber: number;
  text: string;
  imageUrl: string;
  overlays?: Layer[];
  layoutId?: string;
}

export interface Story {
  id: string;
  title: string;
  prompt: string;
  page_count: number;
  pages: StoryPage[];
  cover_image: string | null;
  created_at: string;
  // User-uploaded images attached to this story. Survives deleting the
  // layer that first referenced an image, so the Studio keeps showing it
  // in the Images tab / picker for reuse.
  library_images?: string[];
  // Per-story system prompt prepended to every AI assistant call. Null if
  // unset. The browser also stores a global system prompt in localStorage;
  // both are concatenated (global first, then story) before being sent.
  ai_system_prompt?: string | null;
}

export interface GenerateRequest {
  prompt: string;
  pageCount: number;
}

export interface GenerateResponse {
  storyId: string;
}

// Logical canvas dimensions used by the editor and the reader. All layer
// coordinates are stored in this space; rendering scales to whatever CSS
// size the canvas is shown at.
export const CANVAS_SIZE = 800;
