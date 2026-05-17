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
  params: Promise<{ id: string; aiCastId: string }>;
};

// Rename an AI-cast member. Sync; no regen. Body: { name: string }.
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id: storyId, aiCastId } = await ctx.params;
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
    const patch = body as { name?: unknown };
    if (typeof patch.name !== "string") {
      return NextResponse.json(
        { error: "name (string) required" },
        { status: 400 }
      );
    }
    const trimmed = patch.name.trim();
    if (trimmed.length === 0) {
      return NextResponse.json(
        { error: "name cannot be empty" },
        { status: 400 }
      );
    }
    if (trimmed.length > 120) {
      return NextResponse.json(
        { error: "name must be 120 characters or fewer" },
        { status: 400 }
      );
    }

    const { data: row } = await supabaseAdmin()
      .from("story_ai_cast")
      .update({ name: trimmed })
      .eq("id", aiCastId)
      .eq("story_id", storyId)
      .select("id, name")
      .single<{ id: string; name: string }>();
    if (!row) {
      return NextResponse.json(
        { error: "AI cast member not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ id: row.id, name: row.name });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Remove an AI-cast member. Triggers a Stage 1 re-run with this
// name in `excludedAiCharacterNames`. Pre-Stage-3 only — once the
// user clicks "Approve all & generate pages" and Stage 3 starts,
// the AI cast set is frozen. Returns 409 Conflict if the parent
// job has moved past awaiting_cast_approval.
//
// Returns: { jobId } — the client polls /api/jobs/[id] to know when
// the new approval-gate state is ready.
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id: storyId, aiCastId } = await ctx.params;
    const ownership = await assertOwnsStory(storyId, user.id);
    if (ownership) return ownership;

    const admin = supabaseAdmin();

    // Snapshot the row so we know the name to exclude on re-run.
    const { data: row } = await admin
      .from("story_ai_cast")
      .select("id, name")
      .eq("id", aiCastId)
      .eq("story_id", storyId)
      .maybeSingle<{ id: string; name: string }>();
    if (!row) {
      return NextResponse.json(
        { error: "AI cast member not found" },
        { status: 404 }
      );
    }

    // Block if the parent story has any job past awaiting-approval —
    // i.e. Stage 3 has started or finished. Removing AI cast after
    // page generation would orphan portraits referenced from rendered
    // pages.
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
        (j.status === "running" ||
          j.status === "done") // only treat done/running as locking
      );
    });
    if (blocking) {
      return NextResponse.json(
        { error: "Cast is frozen after pages have started generating" },
        { status: 409 }
      );
    }

    // Delete the row first so re-extraction doesn't see it.
    // story_ai_cast portrait_url is the only persisted reference;
    // pages haven't generated yet so nothing else depends on it.
    const { error: deleteErr } = await admin
      .from("story_ai_cast")
      .delete()
      .eq("id", aiCastId)
      .eq("story_id", storyId);
    if (deleteErr) {
      return NextResponse.json(
        { error: deleteErr.message },
        { status: 500 }
      );
    }

    const jobId = await createJob("ai-cast.removed", user.id);
    await inngest.send({
      name: EVENTS.aiCastRemoved,
      data: { jobId, storyId, removedName: row.name },
    });
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
