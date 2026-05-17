import { GOOGLE_FONTS_HREF } from "@/lib/fonts";

// Loads the 49-family Google Fonts CSS used by TextLayer.fontFamily.
//
// Rendered ONLY from the Studio (`/canvas/[id]`) and Reader
// (`/read/[id]`) page components — the rest of the site has no
// text-layer rendering and shouldn't pay the render-blocking cost.
//
// React 19 hoists `<link>` elements rendered anywhere in the tree to
// `<head>` and deduplicates by href, so dropping this into a page
// component is sufficient.
export default function StudioReaderFontsLink() {
  return <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />;
}
