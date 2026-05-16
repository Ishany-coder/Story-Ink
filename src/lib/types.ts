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
  // ---------------------------------------------------------------------
  // Editor metadata (all optional; legacy layers without these fields
  // continue to work). Persisted as part of overlays so the experience
  // is preserved across reloads.
  // ---------------------------------------------------------------------
  // 0..1; multiplies the rendered alpha. Undefined = 1.
  opacity?: number;
  // If true, the layer is not selectable or editable in the Studio (it
  // still renders). The Layers panel exposes a toggle to flip this.
  locked?: boolean;
  // If true, the layer is hidden in the editor and at render time. Used
  // by the eye-toggle in the Layers panel.
  hidden?: boolean;
  // Optional human-readable name shown in the Layers panel. Defaults to
  // a derived label ("Text", "Shape", "Image").
  name?: string;
  // Layers sharing a non-undefined groupId move together when any one
  // of them is dragged, and ⌘G/⌘⇧G manages this. Optional.
  groupId?: string;
};

export type TextLayer = LayerBase & {
  type: "text";
  text: string;
  fontSize: number;
  color: string;
  fontFamily: string;
  fontWeight: "normal" | "bold";
  // Optional text effects — all undefined = legacy "no effects" rendering.
  italic?: boolean;
  underline?: boolean;
  letterSpacing?: number; // em units, e.g. 0.05
  lineHeight?: number; // multiplier, default 1.15
  textAlign?: "left" | "center" | "right";
  // Drop shadow: present means render a CSS text-shadow.
  shadow?: {
    color: string;
    blur: number; // logical px
    offsetX: number;
    offsetY: number;
  } | null;
  // Stroke / outline. Width is logical px.
  stroke?: {
    color: string;
    width: number;
  } | null;
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
  // Optional shape style polish — all undefined = legacy defaults.
  // Corner radius for rect (logical px). Undefined falls back to 12.
  cornerRadius?: number;
  // SVG-style dash pattern (e.g. "8 4"). Empty / undefined = solid line.
  strokeDash?: string;
};

export type ImageLayer = LayerBase & {
  type: "image";
  src: string;
  // How the image sits in its box. Defaults: layout-source -> "cover" (fill
  // and crop), user-source -> "contain" (letterbox). Empty "add image box"
  // slots override to "cover" so a dropped image visibly fills the frame.
  fit?: "cover" | "contain";
  // Optional CSS filter values applied to the rendered image. All undefined
  // = no filter. Numbers; rendered as percent/blur(px) via CSS filter().
  brightness?: number; // 1 = normal, 0..2
  contrast?: number;   // 1 = normal, 0..2
  saturation?: number; // 1 = normal, 0..2
  blur?: number;       // logical px, 0 = no blur
  // Crop window inside the source image (0..1, relative). When set, only
  // this sub-rectangle of the natural image is shown inside the layer box.
  // Undefined = no crop (full image).
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
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
  // Restricts where this built-in layout shows in the Studio sidebar.
  // Undefined = show always. "memorial" = only show for stories whose
  // pet is in memorial mode. Used by in-loving-memory.
  modeFilter?: "memorial";
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
  // Auth & visibility (introduced when the app gained Supabase Auth).
  user_id?: string | null;
  is_public?: boolean;
  // V2 wizard outputs. Populated by /api/generate/v2 and surfaced
  // through the Studio + Reader.
  recipient_type?: RecipientType;
  occasion?: Occasion;
  art_style_id?: string;
  story_tone?: StoryTone;
  script?: Script;
  cast_character_ids?: string[];
}

// Pet type kept as a minimal stub for the legacy print pipeline path
// (print-pdf.ts builds an optional memorial dedication page from a Pet
// passed in by ship-fulfill.ts; V2 callers always pass null and the
// dedication page is skipped). The full Pet type was removed in the
// V2 cutover — none of these fields are populated for V2 stories.
export interface Pet {
  id: string;
  user_id?: string | null;
  name: string;
  passed_at: string | null;
  dedication_text?: string | null;
  // Always undefined for V2 stories; CanvasEditor uses it to gate the
  // memorial layout preset, which V2 doesn't surface (memorial mode is
  // per-book via stories.occasion now, not per-pet).
  mode?: "living" | "memorial";
}

// Logical canvas dimensions used by the editor and the reader. All layer
// coordinates are stored in this space; rendering scales to whatever CSS
// size the canvas is shown at.
export const CANVAS_SIZE = 800;

// ---------------------------------------------------------------------------
// V2 character + draft + art-style types
// ---------------------------------------------------------------------------

export type CharacterKind = "person" | "pet";

export interface Character {
  id: string;
  user_id: string;
  kind: CharacterKind;
  name: string;
  role_label: string | null;
  traits: string | null;
  species: string | null;
  reference_photo_urls: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateCharacterInput {
  kind: CharacterKind;
  name: string;
  role_label?: string | null;
  traits?: string | null;
  species?: string | null;
  reference_photo_urls?: string[];
}

export type UpdateCharacterInput = Partial<CreateCharacterInput>;

export interface CharacterPortrait {
  id: string;
  character_id: string;
  art_style_id: string;
  portrait_url: string;
  generated_at: string;
}

export interface ArtStyle {
  id: string;
  display_name: string;
  description: string | null;
  prompt_scaffold: string;
  sample_image_urls: string[];
  sort_order: number;
  is_active: boolean;
}

export type RecipientType =
  | "child"
  | "baby"
  | "partner"
  | "parent"
  | "niece_nephew"
  | "sibling"
  | "friend"
  | "grandparent"
  | "pet"
  | "aunt"
  | "uncle"
  | "cousin"
  | "family"
  | "self"
  | "other";

export type Occasion =
  | "birthday"
  | "anniversary"
  | "memorial"
  | "just_because"
  | "graduation"
  | "holiday"
  | "new_baby"
  | "other";

export type StoryTone = "classic" | "rhyming";

export interface WizardPayload {
  recipientType?: RecipientType;
  occasion?: Occasion;
  castCharacterIds?: string[];
  outline?: string;
  keyMemories?: string[];
  artStyleId?: string;
  storyTone?: StoryTone;
  pageCount?: number;
  title?: string;
}

export interface StoryDraft {
  id: string;
  user_id: string;
  title: string | null;
  current_step: number; // 1..7
  payload: WizardPayload;
  created_at: string;
  updated_at: string;
}

// V2 script (output of Stage 1 — generated by Plan B's pipeline).
export interface ScriptPage {
  pageNumber: number;
  text: string;
  sceneDescription: string;
  characterIds: string[];
}

export interface Script {
  title: string;
  dedication?: string;
  pages: ScriptPage[];
}
