import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateAndUploadSticker } from "@/lib/stickers";
import type { Entity, Story } from "@/lib/types";

export const maxDuration = 60;

// Generates (or returns the cached) sticker for an entity. The first call
// hits Gemini, uploads the resulting image to Supabase Storage, and writes
// the URL back onto the entity inside stories.entities. Subsequent calls
// return the cached URL.
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/stories/[id]/entities/[entityId]/sticker">
) {
  const { id, entityId } = await ctx.params;
  console.log("[sticker] POST", { id, entityId });

  const { data: story, error: fetchErr } = await supabaseAdmin()
    .from("stories")
    .select("id, entities")
    .eq("id", id)
    .single<Pick<Story, "id" | "entities">>();

  if (fetchErr || !story) {
    console.error("[sticker] fetch story failed:", { id, fetchErr });
    return NextResponse.json(
      { error: "Story not found", details: fetchErr?.message },
      { status: 404 }
    );
  }

  const entities: Entity[] = story.entities ?? [];
  const target = entities.find((e) => e.id === entityId);
  if (!target) {
    console.error("[sticker] entity not found in story", {
      id,
      entityId,
      availableIds: entities.map((e) => e.id),
    });
    return NextResponse.json(
      {
        error: "Entity not found",
        availableIds: entities.map((e) => e.id),
      },
      { status: 404 }
    );
  }

  if (target.stickerUrl) {
    return NextResponse.json({ stickerUrl: target.stickerUrl });
  }

  let stickerUrl: string;
  try {
    const result = await generateAndUploadSticker(id, target);
    stickerUrl = result.url;
  } catch (err) {
    console.error("[sticker] generation failed:", err);
    return NextResponse.json(
      {
        error: "Sticker generation failed",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }

  const updatedEntities = entities.map((e) =>
    e.id === entityId ? { ...e, stickerUrl } : e
  );

  const { error: updateErr } = await supabaseAdmin()
    .from("stories")
    .update({ entities: updatedEntities })
    .eq("id", id);

  if (updateErr) {
    console.error("[sticker] persist failed:", updateErr);
    // Sticker is uploaded; return the URL even if cache write failed.
  }

  return NextResponse.json({ stickerUrl });
}
