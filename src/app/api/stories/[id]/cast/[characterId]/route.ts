import { NextResponse, type NextRequest } from "next/server";
import {
  requireUser,
  assertOwnsStory,
  UnauthorizedError,
} from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

type RouteContext = {
  params: Promise<{ id: string; characterId: string }>;
};

// Remove a user-cast (main cast) character from this story. The
// character row stays in the user's library (characters table) —
// this just yanks the UUID from stories.cast_character_ids.
//
// Like the AI-cast + background DELETE endpoints (PR #69), this is
// row-only. No Inngest dispatch. The detect-exclusions step inside
// generatePagesAfterApprovalFn picks up the mismatch (script
// references this UUID but cast_character_ids doesn't) and runs
// the script rewrite at approve time.
//
// Pre-Stage-3 only — once pages have started generating, the cast
// is frozen (returns 409 Conflict).
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id: storyId, characterId } = await ctx.params;
    const ownership = await assertOwnsStory(storyId, user.id);
    if (ownership) return ownership;

    const admin = supabaseAdmin();

    const { data: story } = await admin
      .from("stories")
      .select("cast_character_ids")
      .eq("id", storyId)
      .single<{ cast_character_ids: string[] }>();
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }
    if (!story.cast_character_ids.includes(characterId)) {
      return NextResponse.json(
        { error: "Character not in this story's cast" },
        { status: 404 }
      );
    }

    // Same lock as AI-cast / background removal.
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

    const next = story.cast_character_ids.filter((id) => id !== characterId);
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

    return NextResponse.json({ ok: true, characterId });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
