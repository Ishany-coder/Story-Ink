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
  params: Promise<{ id: string; bgId: string }>;
};

// Spec B: regenerate the portrait for a single background.
// Optional body: { promptAddition?: string } — when set, the user's
// addition is persisted on the row before generation, so a
// subsequent regenerate (with no body) replays the same prompt.
// Returns { jobId } — the client polls /api/jobs/[id] to know when
// to swap the portrait URL in the approval-gate UI.
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id: storyId, bgId } = await ctx.params;
    const ownership = await assertOwnsStory(storyId, user.id);
    if (ownership) return ownership;

    const { data: row } = await supabaseAdmin()
      .from("story_backgrounds")
      .select("id")
      .eq("id", bgId)
      .eq("story_id", storyId)
      .maybeSingle<{ id: string }>();
    if (!row) {
      return NextResponse.json(
        { error: "Background not found" },
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

    const jobId = await createJob("background.regenerate", user.id);
    await inngest.send({
      name: EVENTS.backgroundRegenerate,
      data: { jobId, storyId, bgId, promptAddition },
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
