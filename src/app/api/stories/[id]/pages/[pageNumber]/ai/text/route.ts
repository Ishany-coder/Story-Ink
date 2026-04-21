import { NextResponse } from "next/server";
import { createJob } from "@/lib/jobs";
import { inngest } from "@/inngest/client";

export const maxDuration = 10;

interface Body {
  prompt: string;
  globalSystemPrompt?: string | null;
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/stories/[id]/pages/[pageNumber]/ai/text">
) {
  const { id, pageNumber } = await ctx.params;
  const pageNum = Number(pageNumber);
  if (!Number.isFinite(pageNum)) {
    return NextResponse.json(
      { error: "Invalid page number" },
      { status: 400 }
    );
  }
  const body = (await request.json()) as Body;
  const userPrompt = body.prompt?.trim();
  if (!userPrompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const jobId = await createJob("assist.text");
  await inngest.send({
    name: "assist/text.requested",
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
