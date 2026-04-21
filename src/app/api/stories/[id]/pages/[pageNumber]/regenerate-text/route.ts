import { NextResponse } from "next/server";
import { createJob } from "@/lib/jobs";
import { inngest } from "@/inngest/client";

export const maxDuration = 10;

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/stories/[id]/pages/[pageNumber]/regenerate-text">
) {
  const { id, pageNumber } = await ctx.params;
  const pageNum = Number(pageNumber);
  if (!Number.isFinite(pageNum)) {
    return NextResponse.json(
      { error: "Invalid page number" },
      { status: 400 }
    );
  }

  const jobId = await createJob("story.regen-text");
  await inngest.send({
    name: "story/regen-text.requested",
    data: { jobId, storyId: id, pageNumber: pageNum },
  });
  return NextResponse.json({ jobId }, { status: 202 });
}
