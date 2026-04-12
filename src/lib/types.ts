// ---------------------------------------------------------------------------
// Canvas overlay layer types (Canva-style editor)
// ---------------------------------------------------------------------------

export type LayerBase = {
  id: string;
  // Coordinates are in canvas-logical pixels (CANVAS_SIZE x CANVAS_SIZE).
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees
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
  // Marks the source: uploaded by user vs. an entity sticker.
  source: "upload" | "sticker";
};

export type Layer = TextLayer | ShapeLayer | ImageLayer;

// ---------------------------------------------------------------------------
// Story types
// ---------------------------------------------------------------------------

export interface PageExtraction {
  // Sticker as it appears in this specific page (extracted from imageUrl).
  // Has a white background — chroma-keyed to transparent on the client.
  stickerUrl: string;
}

export interface Panel {
  panelNumber: number;
  description: string;
  dialogue: string;
  action: string;
  characters: string[];
  setting: string;
}

export interface StoryPage {
  pageNumber: number;
  text: string;
  imageUrl: string;
  // Present only for comic-mode stories. Drives the multi-panel image
  // prompt and is kept on the row so the editor can show panel metadata.
  panels?: Panel[];
  // Background-only version of the page after entities have been extracted
  // out (inpainted to remove them). Used as the canvas backdrop in the
  // editor so the original character isn't double-visible behind a layer.
  cleanImageUrl?: string;
  // Per-entity extractions, keyed by entity.id. Each entry caches the
  // sticker pulled from this page so subsequent clicks are instant.
  extractions?: Record<string, PageExtraction>;
  overlays?: Layer[];
  // IDs of entities that appear on this page. Populated during generation
  // so the canvas editor only shows relevant entities per page.
  entityIds?: string[];
}

export type EntityType = "character" | "environment" | "object";

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  description: string;
  // Cached transparent-ish PNG of the entity. Filled lazily when the user
  // first drags the entity onto a canvas.
  stickerUrl?: string;
}

export interface Story {
  id: string;
  title: string;
  prompt: string;
  page_count: number;
  pages: StoryPage[];
  cover_image: string | null;
  entities: Entity[] | null;
  mode?: StoryMode;
  created_at: string;
}

export type StoryMode = "storybook" | "comic";

export interface GenerateRequest {
  prompt: string;
  pageCount: number;
  mode?: StoryMode;
}

export interface GenerateResponse {
  storyId: string;
}

export type EditKind = "appearance" | "personality";

export interface EditRequest {
  entityId: string;
  instruction: string;
}

// Logical canvas dimensions used by the editor and the reader. All layer
// coordinates are stored in this space; rendering scales to whatever CSS
// size the canvas is shown at.
export const CANVAS_SIZE = 800;
