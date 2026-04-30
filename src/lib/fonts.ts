// Top-50 Google Fonts available in the Studio's text-layer font picker.
// Each entry stores:
//   - `label`   the human-readable name shown in the picker
//   - `family`  the CSS font-family value persisted on TextLayer.fontFamily.
//               Always includes a fallback chain so unloaded fonts still
//               render something sensible.
//   - `category` one of sans / serif / display / handwriting / mono. Used
//               by the picker to group options into scannable sections.
//
// Loading strategy:
//   These families are loaded site-wide via a single Google Fonts CSS
//   import in `src/app/layout.tsx` (see GOOGLE_FONTS_HREF below). The
//   request body is just CSS — actual font binaries only download when
//   a glyph is rendered in that family, so the cost of loading 50
//   families on every page is negligible until the user opens the
//   picker.

export type FontCategory =
  | "sans"
  | "serif"
  | "display"
  | "handwriting"
  | "mono";

export interface FontOption {
  label: string;
  family: string;
  category: FontCategory;
}

// Site-theme fonts kept at the top of the list so the in-house brand
// type is one click away. After these, the 50 Google Fonts sorted
// roughly by Google Fonts popularity within each category.
export const FONT_OPTIONS: FontOption[] = [
  {
    label: "Display (Fraunces)",
    family: "var(--font-fraunces), Georgia, serif",
    category: "serif",
  },
  {
    label: "Body (Nunito)",
    family: "var(--font-nunito), system-ui, sans-serif",
    category: "sans",
  },

  // ---- Sans-serif ---------------------------------------------------------
  { label: "Inter",            family: '"Inter", system-ui, sans-serif',         category: "sans" },
  { label: "Roboto",           family: '"Roboto", system-ui, sans-serif',        category: "sans" },
  { label: "Open Sans",        family: '"Open Sans", system-ui, sans-serif',     category: "sans" },
  { label: "Montserrat",       family: '"Montserrat", system-ui, sans-serif',    category: "sans" },
  { label: "Lato",             family: '"Lato", system-ui, sans-serif',          category: "sans" },
  { label: "Poppins",          family: '"Poppins", system-ui, sans-serif',       category: "sans" },
  { label: "Source Sans 3",    family: '"Source Sans 3", system-ui, sans-serif', category: "sans" },
  { label: "Roboto Condensed", family: '"Roboto Condensed", system-ui, sans-serif', category: "sans" },
  { label: "Raleway",          family: '"Raleway", system-ui, sans-serif',       category: "sans" },
  { label: "Noto Sans",        family: '"Noto Sans", system-ui, sans-serif',     category: "sans" },
  { label: "Ubuntu",           family: '"Ubuntu", system-ui, sans-serif',        category: "sans" },
  { label: "PT Sans",          family: '"PT Sans", system-ui, sans-serif',       category: "sans" },
  { label: "Rubik",             family: '"Rubik", system-ui, sans-serif',        category: "sans" },
  { label: "Work Sans",         family: '"Work Sans", system-ui, sans-serif',    category: "sans" },
  { label: "Mulish",            family: '"Mulish", system-ui, sans-serif',       category: "sans" },
  { label: "Quicksand",         family: '"Quicksand", system-ui, sans-serif',    category: "sans" },
  { label: "DM Sans",           family: '"DM Sans", system-ui, sans-serif',      category: "sans" },
  { label: "Karla",             family: '"Karla", system-ui, sans-serif',        category: "sans" },
  { label: "Heebo",             family: '"Heebo", system-ui, sans-serif',        category: "sans" },
  { label: "Manrope",           family: '"Manrope", system-ui, sans-serif',      category: "sans" },
  { label: "Barlow",            family: '"Barlow", system-ui, sans-serif',       category: "sans" },
  { label: "Cabin",             family: '"Cabin", system-ui, sans-serif',        category: "sans" },
  { label: "Hind",              family: '"Hind", system-ui, sans-serif',         category: "sans" },
  { label: "Fjalla One",        family: '"Fjalla One", system-ui, sans-serif',   category: "sans" },

  // ---- Serif --------------------------------------------------------------
  { label: "Merriweather",      family: '"Merriweather", Georgia, serif',        category: "serif" },
  { label: "Playfair Display",  family: '"Playfair Display", Georgia, serif',    category: "serif" },
  { label: "Roboto Slab",       family: '"Roboto Slab", Georgia, serif',         category: "serif" },
  { label: "Lora",              family: '"Lora", Georgia, serif',                category: "serif" },
  { label: "Crimson Text",      family: '"Crimson Text", Georgia, serif',        category: "serif" },
  { label: "Libre Baskerville", family: '"Libre Baskerville", Georgia, serif',   category: "serif" },
  { label: "EB Garamond",       family: '"EB Garamond", Georgia, serif',         category: "serif" },
  { label: "Cormorant Garamond",family: '"Cormorant Garamond", Georgia, serif',  category: "serif" },
  { label: "Source Serif 4",    family: '"Source Serif 4", Georgia, serif',      category: "serif" },
  { label: "Bitter",            family: '"Bitter", Georgia, serif',              category: "serif" },
  { label: "Arvo",              family: '"Arvo", Georgia, serif',                category: "serif" },
  { label: "Vollkorn",          family: '"Vollkorn", Georgia, serif',            category: "serif" },
  { label: "Domine",            family: '"Domine", Georgia, serif',              category: "serif" },
  { label: "Spectral",          family: '"Spectral", Georgia, serif',            category: "serif" },

  // ---- Display ------------------------------------------------------------
  { label: "Oswald",            family: '"Oswald", system-ui, sans-serif',       category: "display" },
  { label: "Anton",             family: '"Anton", system-ui, sans-serif',        category: "display" },
  { label: "Bebas Neue",        family: '"Bebas Neue", system-ui, sans-serif',   category: "display" },
  { label: "Lobster",           family: '"Lobster", cursive',                    category: "display" },

  // ---- Handwriting --------------------------------------------------------
  { label: "Dancing Script",    family: '"Dancing Script", cursive',             category: "handwriting" },
  { label: "Pacifico",          family: '"Pacifico", cursive',                   category: "handwriting" },
  { label: "Caveat",            family: '"Caveat", cursive',                     category: "handwriting" },
  { label: "Shadows Into Light",family: '"Shadows Into Light", cursive',         category: "handwriting" },
  { label: "Indie Flower",      family: '"Indie Flower", cursive',               category: "handwriting" },
  { label: "Permanent Marker",  family: '"Permanent Marker", cursive',           category: "handwriting" },

  // ---- Monospace ----------------------------------------------------------
  { label: "Roboto Mono",       family: '"Roboto Mono", ui-monospace, monospace', category: "mono" },
  { label: "Inconsolata",       family: '"Inconsolata", ui-monospace, monospace', category: "mono" },
];

export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: "Sans-serif",
  serif: "Serif",
  display: "Display",
  handwriting: "Handwriting",
  mono: "Monospace",
};

export const FONT_CATEGORY_ORDER: FontCategory[] = [
  "sans",
  "serif",
  "display",
  "handwriting",
  "mono",
];

// Single Google Fonts CSS import URL covering every family in
// FONT_OPTIONS at weight 400 (regular) and 700 (bold) — the two
// weights TextLayer.fontWeight switches between. `display=swap`
// renders fallback glyphs first, then swaps when the webfont is
// loaded — no flash of invisible text.
//
// Generated once and pasted here rather than computed at runtime so
// the URL stays stable across deploys (browser caches it more
// effectively that way).
export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?" +
  [
    "family=Inter:wght@400;700",
    "family=Roboto:wght@400;700",
    "family=Open+Sans:wght@400;700",
    "family=Montserrat:wght@400;700",
    "family=Lato:wght@400;700",
    "family=Poppins:wght@400;700",
    "family=Source+Sans+3:wght@400;700",
    "family=Roboto+Condensed:wght@400;700",
    "family=Raleway:wght@400;700",
    "family=Noto+Sans:wght@400;700",
    "family=Ubuntu:wght@400;700",
    "family=PT+Sans:wght@400;700",
    "family=Rubik:wght@400;700",
    "family=Work+Sans:wght@400;700",
    "family=Mulish:wght@400;700",
    "family=Quicksand:wght@400;700",
    "family=DM+Sans:wght@400;700",
    "family=Karla:wght@400;700",
    "family=Heebo:wght@400;700",
    "family=Manrope:wght@400;700",
    "family=Barlow:wght@400;700",
    "family=Cabin:wght@400;700",
    "family=Hind:wght@400;700",
    "family=Fjalla+One",
    "family=Merriweather:wght@400;700",
    "family=Playfair+Display:wght@400;700",
    "family=Roboto+Slab:wght@400;700",
    "family=Lora:wght@400;700",
    "family=Crimson+Text:wght@400;700",
    "family=Libre+Baskerville:wght@400;700",
    "family=EB+Garamond:wght@400;700",
    "family=Cormorant+Garamond:wght@400;700",
    "family=Source+Serif+4:wght@400;700",
    "family=Bitter:wght@400;700",
    "family=Arvo:wght@400;700",
    "family=Vollkorn:wght@400;700",
    "family=Domine:wght@400;700",
    "family=Spectral:wght@400;700",
    "family=Oswald:wght@400;700",
    "family=Anton",
    "family=Bebas+Neue",
    "family=Lobster",
    "family=Dancing+Script:wght@400;700",
    "family=Pacifico",
    "family=Caveat:wght@400;700",
    "family=Shadows+Into+Light",
    "family=Indie+Flower",
    "family=Permanent+Marker",
    "family=Roboto+Mono:wght@400;700",
    "family=Inconsolata:wght@400;700",
  ].join("&") +
  "&display=swap";

// Lookup helper — resolves a stored font-family CSS value to its
// label for the picker's "currently selected" indicator. Returns
// null for legacy values that don't match any registry entry.
export function findFontByFamily(family: string | undefined): FontOption | null {
  if (!family) return null;
  return FONT_OPTIONS.find((f) => f.family === family) ?? null;
}
