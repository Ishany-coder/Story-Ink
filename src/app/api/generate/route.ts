import { NextRequest, NextResponse } from "next/server";
import {
  generateStoryText,
  generatePageImage,
  extractEntities,
} from "@/lib/gemini";
import { buildEntityReferences } from "@/lib/stickers";
import { supabase } from "@/lib/supabase";
import { Entity, GenerateRequest, StoryPage } from "@/lib/types";

// Reference-image generation makes this route significantly slower —
// 1 text call + 1 extract call + N sticker calls + N page calls.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateRequest;

    if (!body.prompt || body.prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const pageCount = Math.min(Math.max(body.pageCount || 5, 3), 12);

    // 1. Story text
    const storyText = await generateStoryText(body.prompt, pageCount);

    // 2. Extract entities (text descriptions only)
    let entities: Entity[] = [];
    try {
      entities = await extractEntities(storyText.title, storyText.pages);
    } catch (err) {
      console.error("[generate] entity extraction failed:", err);
    }

    // Pre-compute the story id so stickers can be uploaded under
    // stickers/{storyId}/... before the row exists in the DB.
    const storyId = crypto.randomUUID();

    // 3. Generate reference images (stickers) for every entity in parallel,
    // upload them to Storage, and keep their bytes for the page-gen step.
    const { refs, updatedEntities } = await buildEntityReferences(
      storyId,
      entities
    );
    entities = updatedEntities;

    // 4. Generate each page image, passing the entity references so the
    // model uses them for visual consistency.
    const imageResults = await Promise.allSettled(
      storyText.pages.map((page) =>
        generatePageImage(page.text, storyText.title, entities, refs)
      )
    );

    const pages: StoryPage[] = storyText.pages.map((page, i) => ({
      pageNumber: page.pageNumber,
      text: page.text,
      imageUrl:
        imageResults[i].status === "fulfilled"
          ? (imageResults[i] as PromiseFulfilledResult<string>).value
          : "",
      overlays: [],
    }));

    const coverImage = pages[0]?.imageUrl || null;

    // 5. Insert with the precomputed id so it matches the sticker paths.
    const { data, error } = await supabase
      .from("stories")
      .insert({
        id: storyId,
        title: storyText.title,
        prompt: body.prompt,
        page_count: pageCount,
        pages,
        cover_image: coverImage,
        entities,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json(
        { error: "Failed to save story" },
        { status: 500 }
      );
    }

    return NextResponse.json({ storyId: data.id }, { status: 201 });
  } catch (err) {
    console.error("Generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate story" },
      { status: 500 }
    );
  }
}
