// Curated art-style presets for story generation. Each entry maps to
// a style fragment that's appended to the Gemini image prompt. The
// fragment is the literal sentence the model sees, so the wording is
// load-bearing — keep it specific (medium + technique + mood)
// rather than vague.
//
// Storage: stories.image_style holds the id. Fast/Quality is a
// separate latency knob.

export type ImageStyleId =
  | "watercolor"
  | "oil-painting"
  | "ghibli"
  | "pencil"
  | "vintage-storybook"
  | "pastel"
  | "ink-and-color"
  | "pixar";

export interface ImageStyle {
  id: ImageStyleId;
  name: string;
  // One-liner shown under the tile in the picker.
  blurb: string;
  // Inline prompt fragment used inside generatePageImage. Treat as a
  // single declarative sentence — the rest of the prompt is built
  // around it (no-text reminder, scene description, character
  // grounding, etc.).
  prompt: string;
}

export const IMAGE_STYLES: ImageStyle[] = [
  {
    id: "watercolor",
    name: "Whimsical watercolor",
    blurb: "Soft brushwork, warm light, classic picture-book feel.",
    prompt:
      "Style: whimsical watercolor children's book illustration. Soft, slightly textured brushwork, warm color palette, gentle paper grain, painterly edges, classic picture-book composition.",
  },
  {
    id: "oil-painting",
    name: "Classic oil painting",
    blurb: "Rich impasto, museum-poster warmth.",
    prompt:
      "Style: classic oil painting. Rich impasto texture, visible brush strokes, warm earthy palette with deep shadows and golden highlights, cinematic composition reminiscent of 19th-century pet portraits.",
  },
  {
    id: "ghibli",
    name: "Studio Ghibli inspired",
    blurb: "Hand-painted backgrounds, soft cel shading, Miyazaki tenderness.",
    prompt:
      "Style: hand-painted background in the visual tradition of Studio Ghibli (lush nature, soft cel shading, gentle anime expression, atmospheric perspective). Tender, observational mood. Cohesive 2D illustration — not 3D, not photographic.",
  },
  {
    id: "pencil",
    name: "Storybook pencil",
    blurb: "Soft graphite linework with delicate watercolor wash.",
    prompt:
      "Style: graphite pencil drawing on textured paper with delicate watercolor wash. Soft hatching, fine line detail on the character, restrained color palette, vintage children's storybook charm.",
  },
  {
    id: "vintage-storybook",
    name: "Vintage storybook",
    blurb: "Mid-century picture-book gouache.",
    prompt:
      "Style: mid-century vintage children's book illustration in gouache. Flat color planes, slightly off-register printing texture, limited palette of muted earthy tones, cozy nostalgic mood reminiscent of 1950s-60s picture books.",
  },
  {
    id: "pastel",
    name: "Soft pastel",
    blurb: "Chalky pastels, dreamlike haze.",
    prompt:
      "Style: soft pastel illustration. Chalky textures, dreamy diffused light, gentle gradients, delicate pinks-creams-blues palette, slightly hazy atmospheric depth.",
  },
  {
    id: "ink-and-color",
    name: "Pen, ink & color",
    blurb: "Confident black linework with flat color fills.",
    prompt:
      "Style: confident pen-and-ink linework with flat or lightly-modeled color fills. Clean contour lines, expressive but controlled detail, modern editorial picture-book feel.",
  },
  {
    id: "pixar",
    name: "Animated film still",
    blurb: "Polished 3D-animation look, soft volumetric light.",
    prompt:
      "Style: high-end animated feature film still. Polished 3D-animation look with soft volumetric lighting, rich subsurface scattering on fur, painterly textured backgrounds, cinematic depth of field, warm Pixar-adjacent color grading.",
  },
];

export const DEFAULT_IMAGE_STYLE: ImageStyleId = "watercolor";

export function getImageStyle(id: string | null | undefined): ImageStyle {
  return (
    IMAGE_STYLES.find((s) => s.id === id) ??
    IMAGE_STYLES.find((s) => s.id === DEFAULT_IMAGE_STYLE)!
  );
}

export function isImageStyleId(v: unknown): v is ImageStyleId {
  return (
    typeof v === "string" &&
    IMAGE_STYLES.some((s) => s.id === (v as ImageStyleId))
  );
}
