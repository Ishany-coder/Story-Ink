import { NextResponse, type NextRequest } from "next/server";
import {
  requireUser,
  assertOwnsStory,
  UnauthorizedError,
} from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { createJob } from "@/lib/jobs";
import { inngest, EVENTS } from "@/inngest/client";
import type { Script } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string; bgId: string }>;
};

// Spec B: rename a background. Sync; no regen. Body: { label: string }.
// Atomically also rewrites every page's `setting` in the script's
// stored JSON so the script stays referentially consistent with the
// background label. Stage 3 (later) reads `setting` to resolve the
// page's background portrait, so any divergence would break the
// resolution map.
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id: storyId, bgId } = await ctx.params;
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
    const patch = body as { label?: unknown };
    if (typeof patch.label !== "string") {
      return NextResponse.json(
        { error: "label (string) required" },
        { status: 400 }
      );
    }
    const trimmed = patch.label.trim();
    if (trimmed.length === 0) {
      return NextResponse.json(
        { error: "label cannot be empty" },
        { status: 400 }
      );
    }
    if (trimmed.length > 120) {
      return NextResponse.json(
        { error: "label must be 120 characters or fewer" },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();

    // Snapshot the old label so we can find-and-replace it in the
    // script. Pull the current label + script in one round trip.
    const { data: row } = await admin
      .from("story_backgrounds")
      .select("id, label")
      .eq("id", bgId)
      .eq("story_id", storyId)
      .maybeSingle<{ id: string; label: string }>();
    if (!row) {
      return NextResponse.json(
        { error: "Background not found" },
        { status: 404 }
      );
    }
    const oldLabel = row.label;
    if (oldLabel === trimmed) {
      // No-op rename; nothing to update in the script either.
      return NextResponse.json({ id: row.id, label: trimmed });
    }

    const { data: storyRow } = await admin
      .from("stories")
      .select("script")
      .eq("id", storyId)
      .single<{ script: Script | null }>();
    const script = storyRow?.script ?? null;

    // Update the story_backgrounds row first; if the script patch
    // fails after this point, the next Stage 3 attempt will surface
    // an unresolved-setting warning (logged + non-fatal — pages
    // render without a bg ref) and the user can re-label or rename
    // to recover. Better than leaving the row stale.
    const { error: bgErr } = await admin
      .from("story_backgrounds")
      .update({ label: trimmed })
      .eq("id", bgId);
    if (bgErr) {
      return NextResponse.json({ error: bgErr.message }, { status: 500 });
    }

    if (script && Array.isArray(script.pages)) {
      const patchedPages = script.pages.map((p) =>
        p.setting === oldLabel ? { ...p, setting: trimmed } : p
      );
      const patchedBackgrounds = Array.isArray(script.backgrounds)
        ? script.backgrounds.map((b) =>
            b.label === oldLabel ? { ...b, label: trimmed } : b
          )
        : script.backgrounds;
      const patchedScript: Script = {
        ...script,
        pages: patchedPages,
        backgrounds: patchedBackgrounds,
      };
      const { error: scriptErr } = await admin
        .from("stories")
        .update({ script: patchedScript })
        .eq("id", storyId);
      if (scriptErr) {
        console.error(
          "[backgrounds PATCH] script update failed after row update:",
          scriptErr
        );
      }
    }

    return NextResponse.json({ id: row.id, label: trimmed });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Spec B: remove a background. Triggers a Stage 1 re-run with the
// label in `excludedBackgroundLabels`. Pre-Stage-3 only — once
// "Approve all & generate pages" has started for this story, the
// background set is frozen (returns 409 Conflict).
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id: storyId, bgId } = await ctx.params;
    const ownership = await assertOwnsStory(storyId, user.id);
    if (ownership) return ownership;

    const admin = supabaseAdmin();

    const { data: row } = await admin
      .from("story_backgrounds")
      .select("id, label")
      .eq("id", bgId)
      .eq("story_id", storyId)
      .maybeSingle<{ id: string; label: string }>();
    if (!row) {
      return NextResponse.json(
        { error: "Background not found" },
        { status: 404 }
      );
    }

    // Same lock as AI-cast removal: if a Stage 3 job has run or is
    // running for this story, removal is blocked.
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
        { error: "Settings are frozen after pages have started generating" },
        { status: 409 }
      );
    }

    // Delete the row first so re-extraction doesn't re-see it via
    // case-insensitive label match.
    const { error: deleteErr } = await admin
      .from("story_backgrounds")
      .delete()
      .eq("id", bgId)
      .eq("story_id", storyId);
    if (deleteErr) {
      return NextResponse.json(
        { error: deleteErr.message },
        { status: 500 }
      );
    }

    const jobId = await createJob("background.removed", user.id);
    await inngest.send({
      name: EVENTS.backgroundRemoved,
      data: { jobId, storyId, removedLabel: row.label },
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
