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

// Create a new AI-cast (supporting) character at the approval gate.
// Inserts a story_ai_cast row + fires regenerate so a portrait gets
// generated using the same plumbing as the existing pencil-edit
// regenerate flow.
//
// Body: { name, roleLabel?, kind, description }
// Response: { aiCastId, jobId, name, roleLabel, kind }
//
// Like main-cast add, jobId is the polling target — the UI shows a
// placeholder card with a regen spinner until /api/jobs/[jobId]
// reports done with the portrait URL.
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
    const {
      name,
      roleLabel,
      kind,
      description,
    } = (body ?? {}) as {
      name?: unknown;
      roleLabel?: unknown;
      kind?: unknown;
      description?: unknown;
    };
    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "name (string) required" },
        { status: 400 }
      );
    }
    if (name.trim().length > 120) {
      return NextResponse.json(
        { error: "name must be 120 characters or fewer" },
        { status: 400 }
      );
    }
    if (kind !== "person" && kind !== "pet") {
      return NextResponse.json(
        { error: "kind must be 'person' or 'pet'" },
        { status: 400 }
      );
    }
    if (typeof description !== "string" || description.trim().length === 0) {
      return NextResponse.json(
        { error: "description (string) required" },
        { status: 400 }
      );
    }
    const roleLabelStr =
      typeof roleLabel === "string" && roleLabel.trim().length > 0
        ? roleLabel.trim()
        : null;

    const admin = supabaseAdmin();

    // Stage-3 lock.
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

    const { data: inserted, error: insertErr } = await admin
      .from("story_ai_cast")
      .insert({
        story_id: storyId,
        name: name.trim(),
        role_label: roleLabelStr,
        kind,
        description: description.trim(),
      })
      .select("id, name, role_label, kind")
      .single<{
        id: string;
        name: string;
        role_label: string | null;
        kind: "person" | "pet";
      }>();
    if (insertErr || !inserted) {
      return NextResponse.json(
        { error: insertErr?.message ?? "insert failed" },
        { status: 500 }
      );
    }

    const jobId = await createJob("ai-cast.portrait.regenerate", user.id);
    await inngest.send({
      name: EVENTS.aiCastRegenerate,
      data: { jobId, storyId, aiCastId: inserted.id },
    });

    return NextResponse.json({
      aiCastId: inserted.id,
      jobId,
      name: inserted.name,
      roleLabel: inserted.role_label,
      kind: inserted.kind,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
