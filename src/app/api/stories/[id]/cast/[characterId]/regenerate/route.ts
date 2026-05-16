import { NextResponse, type NextRequest } from "next/server";
import {
  requireUser,
  assertOwnsStory,
  UnauthorizedError,
} from "@/lib/supabase-server";
import { createJob } from "@/lib/jobs";
import { inngest, EVENTS } from "@/inngest/client";

type RouteContext = {
  params: Promise<{ id: string; characterId: string }>;
};

export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id: storyId, characterId } = await ctx.params;
    const ownership = await assertOwnsStory(storyId, user.id);
    if (ownership) return ownership;

    const jobId = await createJob("character.portrait.regenerate", user.id);
    await inngest.send({
      name: EVENTS.characterRegenerate,
      data: { jobId, storyId, characterId },
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
