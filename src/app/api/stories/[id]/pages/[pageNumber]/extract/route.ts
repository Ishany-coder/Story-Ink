import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  extractEntityFromImage,
  removeEntityFromImage,
} from "@/lib/gemini";
import { fetchStickerBytes, uploadImageBytes } from "@/lib/stickers";
import type { Entity, Story, StoryPage } from "@/lib/types";

// Two parallel Gemini image-to-image calls — be generous with the timeout.
export const maxDuration = 300;

interface ExtractBody {
  entityId: string;
}

// Pulls one entity OUT of a page image. In parallel:
//   1. Extract — produces an isolated sticker of the entity
//   2. Inpaint — produces a copy of the page with the entity removed
// Both are cached on the page object so subsequent extractions of the
// same entity from the same page are instant.
//
// The "current" page image fed into both calls is the most recently
// inpainted version (page.cleanImageUrl ?? page.imageUrl). That way
// extracting multiple entities from the same page progressively cleans
// the background — each new extraction sees the prior cleanup.
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/stories/[id]/pages/[pageNumber]/extract">
) {
  const { id, pageNumber } = await ctx.params;
  const pageNum = Number(pageNumber);
  if (!Number.isFinite(pageNum)) {
    return NextResponse.json(
      { error: "Invalid page number" },
      { status: 400 }
    );
  }

  const body = (await request.json()) as ExtractBody;
  if (!body.entityId) {
    return NextResponse.json(
      { error: "entityId is required" },
      { status: 400 }
    );
  }

  console.log("[extract] POST", { id, pageNum, entityId: body.entityId });

  const { data: story, error: fetchErr } = await supabaseAdmin()
    .from("stories")
    .select("*")
    .eq("id", id)
    .single<Story>();

  if (fetchErr || !story) {
    console.error("[extract] fetch story failed:", fetchErr);
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  const page = story.pages.find((p) => p.pageNumber === pageNum);
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const entity: Entity | undefined = (story.entities ?? []).find(
    (e) => e.id === body.entityId
  );
  if (!entity) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  // Cache hit: this entity has already been extracted from this page.
  const cached = page.extractions?.[entity.id];
  if (cached) {
    return NextResponse.json({
      stickerUrl: cached.stickerUrl,
      cleanImageUrl: page.cleanImageUrl ?? page.imageUrl,
      cached: true,
    });
  }

  // Source image: most recently cleaned version if available.
  const sourceUrl = page.cleanImageUrl ?? page.imageUrl;
  if (!sourceUrl) {
    return NextResponse.json(
      { error: "Page has no image to extract from" },
      { status: 400 }
    );
  }

  let pageBytes;
  try {
    pageBytes = await fetchStickerBytes(sourceUrl);
  } catch (err) {
    console.error("[extract] failed to fetch page image:", err);
    return NextResponse.json(
      { error: "Couldn't load page image" },
      { status: 500 }
    );
  }

  let stickerBytes;
  let inpaintedBytes;
  try {
    [stickerBytes, inpaintedBytes] = await Promise.all([
      extractEntityFromImage(pageBytes, entity),
      removeEntityFromImage(pageBytes, entity),
    ]);
  } catch (err) {
    console.error("[extract] gemini failed:", err);
    return NextResponse.json(
      {
        error: "Extraction failed",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }

  let stickerUrl: string;
  let cleanImageUrl: string;
  try {
    [stickerUrl, cleanImageUrl] = await Promise.all([
      uploadImageBytes(`extractions/${id}/p${pageNum}/${entity.id}-sticker`, stickerBytes),
      uploadImageBytes(`extractions/${id}/p${pageNum}/clean`, inpaintedBytes),
    ]);
  } catch (err) {
    console.error("[extract] upload failed:", err);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }

  const nextPages: StoryPage[] = story.pages.map((p) => {
    if (p.pageNumber !== pageNum) return p;
    return {
      ...p,
      cleanImageUrl,
      extractions: {
        ...(p.extractions ?? {}),
        [entity.id]: { stickerUrl },
      },
    };
  });

  const { error: updateErr } = await supabaseAdmin()
    .from("stories")
    .update({ pages: nextPages })
    .eq("id", id);

  if (updateErr) {
    console.error("[extract] persist failed:", updateErr);
    // Both files are uploaded; return the URLs even if cache write failed.
  }

  return NextResponse.json({
    stickerUrl,
    cleanImageUrl,
    cached: false,
  });
}
