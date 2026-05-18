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

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id: storyId, characterId } = await ctx.params;
    const ownership = await assertOwnsStory(storyId, user.id);
    if (ownership) return ownership;

    // Optional one-shot prompt addition the user typed at the
    // approval-gate Regenerate prompt box. Threaded through to
    // generateCastPortrait but never persisted — the user's photo
    // remains the canonical likeness, the addition just tweaks the
    // current regeneration.
    let promptAddition: string | undefined;
    if (req.headers.get("content-length") !== "0" && req.body) {
      try {
        const body = (await req.json()) as { promptAddition?: unknown };
        if (typeof body.promptAddition === "string") {
          promptAddition = body.promptAddition;
        }
      } catch {
        // empty / non-JSON body is fine — treat as no addition
      }
    }

    const jobId = await createJob("character.portrait.regenerate", user.id);
    await inngest.send({
      name: EVENTS.characterRegenerate,
      data: { jobId, storyId, characterId, promptAddition },
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
