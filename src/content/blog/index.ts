// Blog post registry. Each post lives in its own TS module exporting a
// `BlogPost`; this file aggregates them so the listing page can render
// them by `publishedAt` desc and the slug page can look one up by id.
//
// Vanilla TypeScript modules instead of MDX — fewer deps, full type
// checking on every field, and the content stays inside the build
// graph (no separate content-loader plumbing needed).

import { post as petStorybookVsAlbum } from "./pet-storybook-vs-photo-album";
import { post as livingVsMemorial } from "./living-vs-memorial-mode";
import { post as howToWritePrompt } from "./how-to-write-a-great-prompt";
import { post as behindTheIllustrations } from "./behind-the-illustrations";
import { post as bedtimeRitual } from "./bedtime-reading-ritual";
import { post as memorialNotes } from "./memorializing-a-pet";
import { post as referencePhotos } from "./science-of-pet-reference-photos";

export type BlogBlock =
  | { type: "heading"; content: string }
  | { type: "paragraph"; content: string }
  | { type: "quote"; content: string }
  | { type: "list"; content: string[] };

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  body: BlogBlock[];
  publishedAt: string; // ISO date (YYYY-MM-DD)
  readMinutes: number;
  author: string;
  ogImage?: string;
  // SEO surface data, all optional so legacy posts keep compiling.
  // - metaDescription overrides the excerpt for the <meta name=
  //   "description"> tag and the matching OpenGraph/Twitter cards
  //   (the on-page excerpt under the H1 still uses excerpt).
  // - keywords is exposed as JSON-LD `keywords` (comma-joined).
  // - category seeds JSON-LD `articleSection`. Falls back to
  //   "Pet storybooks" when unset (see src/app/blog/[slug]/page.tsx).
  metaDescription?: string;
  keywords?: string[];
  category?: string;
}

// Ordered newest-first so the listing page can render directly off
// this constant without sorting at request time.
export const POSTS: BlogPost[] = [
  petStorybookVsAlbum,
  livingVsMemorial,
  howToWritePrompt,
  behindTheIllustrations,
  bedtimeRitual,
  memorialNotes,
  referencePhotos,
].sort(
  (a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
);

export function getPostBySlug(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}

export function getRelatedPosts(
  slug: string,
  count = 3,
): BlogPost[] {
  const others = POSTS.filter((p) => p.slug !== slug);
  // Stable "random": hash the slug into a starting offset so a given
  // post page always shows the same set of related posts (good for
  // caching + SEO + user trust) but different posts surface different
  // related sets across the listing page.
  let seed = 0;
  for (let i = 0; i < slug.length; i += 1) {
    seed = (seed * 31 + slug.charCodeAt(i)) >>> 0;
  }
  const start = others.length === 0 ? 0 : seed % others.length;
  const out: BlogPost[] = [];
  for (let i = 0; i < Math.min(count, others.length); i += 1) {
    out.push(others[(start + i) % others.length]);
  }
  return out;
}
