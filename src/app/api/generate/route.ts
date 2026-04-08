import { NextRequest, NextResponse } from "next/server";
import {
  generateStoryText,
  generatePageImage,
  extractEntities,
  generateComicScript,
  generateComicPageImage,
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
    const mode = body.mode === "comic" ? "comic" : "storybook";

    // 1. Script generation. Comic mode produces structured panel JSON;
    // storybook mode produces flat narrative text per page.
    type ScriptPage = {
      pageNumber: number;
      text: string;
      panels?: import("@/lib/types").Panel[];
    };
    let title: string;
    let scriptPages: ScriptPage[];

    if (mode === "comic") {
      const script = await generateComicScript(body.prompt, pageCount);
      title = script.title;
      scriptPages = script.pages.map((p) => ({
        pageNumber: p.pageNumber,
        // Synthesize a text summary so the storybook reader (and entity
        // extraction) still has something to chew on for comic pages.
        text: p.panels
          .map((panel) => panel.action || panel.description)
          .join(" "),
        panels: p.panels,
      }));
    } else {
      const storyText = await generateStoryText(body.prompt, pageCount);
      title = storyText.title;
      scriptPages = storyText.pages.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.text,
      }));
    }

    // 2. Extract entities (text descriptions only). For comic mode this
    // runs against the synthesized panel-action text — good enough to
    // surface the recurring characters and locations.
    let entities: Entity[] = [];
    try {
      entities = await extractEntities(
        title,
        scriptPages.map((p) => ({ pageNumber: p.pageNumber, text: p.text }))
      );
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

    // 4. Generate each page image. Comic pages render multi-panel layouts
    // via gemini-3-pro-image-preview; storybook pages stay on the existing
    // single-illustration path.
    const imageResults = await Promise.allSettled(
      scriptPages.map((page) =>
        mode === "comic" && page.panels
          ? generateComicPageImage(
              { pageNumber: page.pageNumber, panels: page.panels },
              title,
              entities,
              refs
            )
          : generatePageImage(page.text, title, entities, refs)
      )
    );

    const pages: StoryPage[] = scriptPages.map((page, i) => ({
      pageNumber: page.pageNumber,
      text: page.text,
      imageUrl:
        imageResults[i].status === "fulfilled"
          ? (imageResults[i] as PromiseFulfilledResult<string>).value
          : "",
      panels: page.panels,
      overlays: [],
    }));

    const coverImage = pages[0]?.imageUrl || null;

    // 5. Insert with the precomputed id so it matches the sticker paths.
    const { data, error } = await supabase
      .from("stories")
      .insert({
        id: storyId,
        title,
        prompt: body.prompt,
        page_count: pageCount,
        pages,
        cover_image: coverImage,
        entities,
        mode,
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
