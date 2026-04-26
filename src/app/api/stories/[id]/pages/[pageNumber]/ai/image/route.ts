import { NextResponse } from "next/server";
import { createJob } from "@/lib/jobs";
import { inngest } from "@/inngest/client";
import { assertOwnsStory, getCurrentUser } from "@/lib/supabase-server";

export const maxDuration = 10;

interface Body {
  prompt: string;
  globalSystemPrompt?: string | null;
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/stories/[id]/pages/[pageNumber]/ai/image">
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id, pageNumber } = await ctx.params;
  const pageNum = Number(pageNumber);
  if (!Number.isFinite(pageNum)) {
    return NextResponse.json(
      { error: "Invalid page number" },
      { status: 400 }
    );
  }
  const denied = await assertOwnsStory(id, user.id);
  if (denied) return denied;
  const body = (await request.json()) as Body;
  const userPrompt = body.prompt?.trim();
  if (!userPrompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const jobId = await createJob("assist.image", user.id);
  await inngest.send({
    name: "assist/image.requested",
    data: {
      jobId,
      storyId: id,
      pageNumber: pageNum,
      prompt: userPrompt,
      globalSystemPrompt: body.globalSystemPrompt ?? null,
    },
  });
  return NextResponse.json({ jobId }, { status: 202 });
}
