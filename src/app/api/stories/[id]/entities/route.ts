import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { extractEntities } from "@/lib/gemini";
import type { Entity, StoryPage } from "@/lib/types";

export const maxDuration = 60;

// Lazy entity extraction for stories created before AI Studio existed.
// POSTing to this endpoint extracts entities from the saved pages and
// caches them on the row. Returns the entity list.
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/stories/[id]/entities">
) {
  const { id } = await ctx.params;

  const { data: story, error: fetchErr } = await supabase
    .from("stories")
    .select("id, title, pages, entities")
    .eq("id", id)
    .single();

  if (fetchErr || !story) {
    console.error("[entities] fetch failed:", { id, fetchErr });
    return NextResponse.json(
      { error: "Story not found", details: fetchErr?.message },
      { status: 404 }
    );
  }

  if (story.entities && (story.entities as Entity[]).length > 0) {
    return NextResponse.json({ entities: story.entities });
  }

  let entities: Entity[] = [];
  try {
    const extraction = await extractEntities(story.title, story.pages);
    entities = extraction.entities;

    // Backfill entityIds onto pages for legacy stories.
    const pages = (story.pages as StoryPage[]).map((p) => ({
      ...p,
      entityIds: extraction.pageEntityMap[p.pageNumber] ?? [],
    }));

    const { error: updateErr } = await supabase
      .from("stories")
      .update({ entities, pages })
      .eq("id", id);

    if (updateErr) {
      console.error("[entities] persist failed:", updateErr);
      return NextResponse.json(
        { error: "Failed to save entities" },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("[entities] extraction failed:", err);
    return NextResponse.json(
      { error: "Failed to extract entities" },
      { status: 500 }
    );
  }

  return NextResponse.json({ entities });
}
