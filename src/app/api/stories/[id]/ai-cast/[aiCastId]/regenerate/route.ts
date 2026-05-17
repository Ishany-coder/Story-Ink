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

// Regenerate the portrait for a single AI-cast member. Optional body:
// { promptAddition?: string } — when set, the user's prompt addition
// is persisted on the row before generation, so a subsequent
// regenerate (with no body) replays the same prompt. Returns
// { jobId } — the client polls /api/jobs/[id] to know when to swap
// the portrait URL in the approval-gate UI.
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id: storyId, aiCastId } = await ctx.params;
    const ownership = await assertOwnsStory(storyId, user.id);
    if (ownership) return ownership;

    // Verify the AI-cast row exists and belongs to this story.
    // (RLS already gates on story ownership, but a 404 here is
    // clearer than a silent no-op down in the Inngest function.)
    const { data: row } = await supabaseAdmin()
      .from("story_ai_cast")
      .select("id")
      .eq("id", aiCastId)
      .eq("story_id", storyId)
      .maybeSingle<{ id: string }>();
    if (!row) {
      return NextResponse.json(
        { error: "AI cast member not found" },
        { status: 404 }
      );
    }

    let promptAddition: string | undefined;
    if (req.headers.get("content-length") !== "0" && req.body) {
      try {
        const body = (await req.json()) as { promptAddition?: unknown };
        if (typeof body.promptAddition === "string") {
          promptAddition = body.promptAddition;
        }
      } catch {
        // empty / non-JSON body is fine — treat as no override
      }
    }

    const jobId = await createJob("ai-cast.portrait.regenerate", user.id);
    await inngest.send({
      name: EVENTS.aiCastRegenerate,
      data: { jobId, storyId, aiCastId, promptAddition },
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
