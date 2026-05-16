import { NextResponse, type NextRequest } from "next/server";
import {
  requireUser,
  assertOwnsStory,
  UnauthorizedError,
} from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { inngest, EVENTS } from "@/inngest/client";

type RouteContext = { params: Promise<{ id: string }> };

interface JobResultLite {
  storyId?: string;
}

export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id: storyId } = await ctx.params;
    const ownership = await assertOwnsStory(storyId, user.id);
    if (ownership) return ownership;

    const admin = supabaseAdmin();
    const { data: jobs } = await admin
      .from("jobs")
      .select("id, status, result")
      .eq("user_id", user.id)
      .eq("status", "awaiting_cast_approval")
      .order("created_at", { ascending: false })
      .limit(20);

    // Match the awaiting job whose result.storyId points at this story.
    let jobId: string | null = null;
    for (const j of jobs ?? []) {
      const r = j.result as JobResultLite | null;
      if (r?.storyId === storyId) {
        jobId = j.id;
        break;
      }
    }
    if (!jobId) {
      return NextResponse.json({ error: "no awaiting job" }, { status: 404 });
    }

    await inngest.send({
      name: EVENTS.castApproved,
      data: { jobId, storyId },
    });
    return NextResponse.json({ ok: true, jobId });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
