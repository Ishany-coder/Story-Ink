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

export type ShapeKind = "rect" | "circle" | "line";

export type ShapeLayer = LayerBase & {
  type: "shape";
  shape: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
};

export type ImageLayer = LayerBase & {
  type: "image";
  src: string;
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
  imageRegion: Rect;
  textRegion: Rect;
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
