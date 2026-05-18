import { NextResponse, type NextRequest } from "next/server";
import {
  requireUser,
  assertOwnsStory,
  UnauthorizedError,
} from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { createJob } from "@/lib/jobs";
import { inngest, EVENTS } from "@/inngest/client";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// Add one or more user-cast (main cast) characters to this story
// from the user's library. Appends to stories.cast_character_ids
// (deduped) + fires a regenerate event per newly-added character
// so a portrait gets produced. Existing character_portraits cache
// is reused: if a (character, art_style) portrait is already
// cached, the regenerate function picks it up via upsert and the
// job finishes near-instantly with the cached URL.
//
// Body: { characterIds: string[] }
// Response: { added: [{ characterId, name, jobId, portraitUrl? }] }
//
// portraitUrl is populated synchronously when the portrait was
// already cached; otherwise jobId is the polling target (same shape
// as the existing regenerate response).
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id: storyId } = await ctx.params;
    const ownership = await assertOwnsStory(storyId, user.id);
    if (ownership) return ownership;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }
    const { characterIds } = (body ?? {}) as { characterIds?: unknown };
    if (
      !Array.isArray(characterIds) ||
      characterIds.length === 0 ||
      !characterIds.every((x) => typeof x === "string")
    ) {
      return NextResponse.json(
        { error: "characterIds (string[]) required" },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();

    // Verify every characterId belongs to the user. Defense against
    // a client passing someone else's UUIDs.
    const { data: ownedChars } = await admin
      .from("characters")
      .select("id, name")
      .eq("user_id", user.id)
      .in("id", characterIds as string[]);
    const ownedById = new Map(
      (ownedChars ?? []).map((c) => [c.id, c.name as string])
    );
    if (ownedById.size !== (characterIds as string[]).length) {
      return NextResponse.json(
        { error: "One or more characters not found in your library" },
        { status: 404 }
      );
    }

    const { data: story } = await admin
      .from("stories")
      .select("cast_character_ids, art_style_id")
      .eq("id", storyId)
      .single<{ cast_character_ids: string[]; art_style_id: string }>();
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    // Stage-3 lock — same shape as the DELETE endpoints.
    const { data: laterJobs } = await admin
      .from("jobs")
      .select("id, status, result")
      .eq("user_id", user.id)
      .neq("status", "awaiting_cast_approval")
      .order("created_at", { ascending: false })
      .limit(50);
    const blocking = (laterJobs ?? []).find((j) => {
      const r = j.result as { storyId?: string } | null;
      return (
        r?.storyId === storyId &&
        (j.status === "running" || j.status === "done")
      );
    });
    if (blocking) {
      return NextResponse.json(
        { error: "Cast is frozen after pages have started generating" },
        { status: 409 }
      );
    }

    // Dedup against existing cast_character_ids.
    const existing = new Set(story.cast_character_ids);
    const toAdd = (characterIds as string[]).filter((id) => !existing.has(id));
    if (toAdd.length === 0) {
      return NextResponse.json({ added: [] });
    }
    const next = [...story.cast_character_ids, ...toAdd];
    const { error: updateErr } = await admin
      .from("stories")
      .update({ cast_character_ids: next })
      .eq("id", storyId);
    if (updateErr) {
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500 }
      );
    }

    // For each newly-added character, look up the cache and either
    // return the cached URL synchronously OR dispatch a regen event.
    const { data: cached } = await admin
      .from("character_portraits")
      .select("character_id, portrait_url")
      .in("character_id", toAdd)
      .eq("art_style_id", story.art_style_id);
    const cachedById = new Map(
      (cached ?? []).map((r) => [r.character_id, r.portrait_url as string])
    );

    const added = await Promise.all(
      toAdd.map(async (characterId) => {
        const name = ownedById.get(characterId)!;
        const portraitUrl = cachedById.get(characterId);
        if (portraitUrl) {
          return { characterId, name, portraitUrl };
        }
        const jobId = await createJob(
          "character.portrait.regenerate",
          user.id
        );
        await inngest.send({
          name: EVENTS.characterRegenerate,
          data: { jobId, storyId, characterId },
        });
        return { characterId, name, jobId };
      })
    );

    return NextResponse.json({ added });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
