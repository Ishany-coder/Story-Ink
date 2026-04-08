import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  classifyEdit,
  extractEntities,
  generatePageImage,
  rewriteEntityDescription,
  rewriteStory,
} from "@/lib/gemini";
import { buildEntityReferences } from "@/lib/stickers";
import type { EditRequest, Entity, Story, StoryPage } from "@/lib/types";

export const maxDuration = 300;

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/stories/[id]/edit">
) {
  const { id } = await ctx.params;
  const body = (await request.json()) as EditRequest;

  if (!body.entityId || !body.instruction?.trim()) {
    return NextResponse.json(
      { error: "entityId and instruction are required" },
      { status: 400 }
    );
  }

  const { data: story, error: fetchErr } = await supabase
    .from("stories")
    .select("*")
    .eq("id", id)
    .single<Story>();

  if (fetchErr || !story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  const entities: Entity[] = story.entities ?? [];
  const target = entities.find((e) => e.id === body.entityId);
  if (!target) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  let kind: Awaited<ReturnType<typeof classifyEdit>>;
  try {
    kind = await classifyEdit(target, body.instruction);
  } catch (err) {
    console.error("[edit] classify failed:", err);
    return NextResponse.json(
      { error: "Failed to classify edit" },
      { status: 500 }
    );
  }

  let nextTitle = story.title;
  let nextPages: StoryPage[] = story.pages;
  let nextEntities: Entity[] = entities;

  try {
    if (kind === "appearance") {
      // Update only the target entity's description, and CLEAR its sticker
      // URL so buildEntityReferences will regenerate it. Other entities
      // keep their cached stickers.
      const newDescription = await rewriteEntityDescription(
        target,
        body.instruction
      );
      nextEntities = entities.map((e) =>
        e.id === target.id
          ? { ...e, description: newDescription, stickerUrl: undefined }
          : e
      );
    } else {
      // Personality / behavior change: rewrite the whole story, then
      // re-extract entities from the new text so descriptions stay in sync.
      const rewritten = await rewriteStory(
        story.prompt,
        story.title,
        story.pages,
        target,
        body.instruction
      );
      nextTitle = rewritten.title;

      // Re-extract entities from the new story text. Preserve old
      // descriptions AND sticker URLs for entities that survived (matched
      // by id), so visual consistency carries over and we don't pay to
      // regenerate stickers that haven't changed. The edited entity gets
      // the freshly extracted description (since its behavior changed) but
      // KEEPS its sticker — personality doesn't affect appearance.
      const freshlyExtracted = await extractEntities(
        rewritten.title,
        rewritten.pages
      );
      const oldById = new Map(entities.map((e) => [e.id, e]));
      nextEntities = freshlyExtracted.map((e) => {
        const old = oldById.get(e.id);
        if (!old) return e;
        if (e.id === target.id) {
          return { ...e, stickerUrl: old.stickerUrl };
        }
        return {
          ...e,
          description: old.description,
          stickerUrl: old.stickerUrl,
        };
      });

      // Build skeleton pages with empty image URLs; images regenerated next.
      // Carry forward any user-placed overlays from the matching old page so
      // canvas-editor work survives a personality rewrite.
      const overlaysByPage = new Map(
        story.pages.map((p) => [p.pageNumber, p.overlays ?? []])
      );
      nextPages = rewritten.pages.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.text,
        imageUrl: "",
        overlays: overlaysByPage.get(p.pageNumber) ?? [],
      }));
    }

    // Build references: regenerates the target's sticker (appearance edit)
    // or any new entities' stickers (personality edit), and re-fetches the
    // others. Updates entity rows with their (possibly new) sticker URLs.
    const { refs, updatedEntities } = await buildEntityReferences(
      id,
      nextEntities
    );
    nextEntities = updatedEntities;

    // Regenerate every page image with the entity references.
    const imageResults = await Promise.allSettled(
      nextPages.map((page) =>
        generatePageImage(page.text, nextTitle, nextEntities, refs)
      )
    );

    nextPages = nextPages.map((page, i) => ({
      ...page,
      imageUrl:
        imageResults[i].status === "fulfilled"
          ? (imageResults[i] as PromiseFulfilledResult<string>).value
          : page.imageUrl,
    }));
  } catch (err) {
    console.error("[edit] apply failed:", err);
    return NextResponse.json(
      { error: "Failed to apply edit" },
      { status: 500 }
    );
  }

  const { error: updateErr } = await supabase
    .from("stories")
    .update({
      title: nextTitle,
      pages: nextPages,
      entities: nextEntities,
      cover_image: nextPages[0]?.imageUrl || null,
    })
    .eq("id", id);

  if (updateErr) {
    console.error("[edit] persist failed:", updateErr);
    return NextResponse.json(
      { error: "Failed to save edited story" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    kind,
    title: nextTitle,
    pages: nextPages,
    entities: nextEntities,
  });
}
