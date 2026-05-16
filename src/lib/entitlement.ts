import { isBetaTesting } from "@/lib/beta-flag";

// Shared "does this viewer have full (unwatermarked) access to this
// story?" check. Used by:
//   - /read/[id] reader (its `fullAccess` variable historically had
//     this logic inlined — kept consistent here so future surfaces
//     don't drift).
//   - /canvas/[id] editor (so owners editing their own book see the
//     same watermarked previews they'd see in the reader until they
//     pay — and clean images once they do).
//   - Cover/library/OG renderers (default `isAdmin = false` for
//     anonymous contexts, where only is_public / beta unlock the
//     clean cover).
//
// `digital_unlocked` is the single source of truth for "paid status."
// /api/ship/stripe/webhook flips it to true on both digital purchases
// and hardcover orders, so a single boolean covers every paid path.
//
// `isAdmin` is taken as a pre-computed boolean rather than a User —
// resolving admin status pulls in `@/lib/admin` which transitively
// imports server-only `next/headers`. Keeping this module pure data
// lets client components (CanvasEditor, SlideReader) use the picker
// helpers below without dragging the server graph into their bundle.
export function storyHasFullAccess(
  story: { digital_unlocked?: boolean | null; is_public?: boolean | null },
  opts: { isAdmin?: boolean } = {}
): boolean {
  if (story.digital_unlocked === true) return true;
  if (story.is_public === true) return true;
  if (opts.isAdmin === true) return true;
  if (isBetaTesting()) return true;
  return false;
}

// Watermark gate. Returns true when the viewer should see the clean
// (unwatermarked) page images. Same logic as storyHasFullAccess
// MINUS the beta flag — beta testers are supposed to dogfood the
// unpaid funnel, so they see watermarked previews like a real
// not-yet-paid customer would. Admin is retained so ops can review
// real artwork.
export function storyImagesAreClean(
  story: { digital_unlocked?: boolean | null; is_public?: boolean | null },
  opts: { isAdmin?: boolean } = {}
): boolean {
  if (story.digital_unlocked === true) return true;
  if (story.is_public === true) return true;
  if (opts.isAdmin === true) return true;
  return false;
}

// Pick the right image URL for a page given a viewer's access level.
// Fallback to imageUrl when no watermarked variant exists yet (covers
// pages generated before this rollout).
export function pickPageImageUrl(
  page: { imageUrl: string; watermarkedImageUrl?: string | null },
  fullAccess: boolean
): string {
  if (fullAccess) return page.imageUrl;
  return page.watermarkedImageUrl || page.imageUrl;
}

// Pick the right cover image for a story. Stories without a
// watermarked cover (legacy) fall back to the original cover_image.
export function pickStoryCover(
  story: {
    cover_image?: string | null;
    cover_image_watermarked?: string | null;
  },
  fullAccess: boolean
): string | null {
  if (fullAccess) return story.cover_image ?? null;
  return story.cover_image_watermarked || story.cover_image || null;
}
