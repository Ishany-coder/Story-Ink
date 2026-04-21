import { NextRequest, NextResponse } from "next/server";
import { GenerateRequest } from "@/lib/types";
import { createJob } from "@/lib/jobs";
import { inngest } from "@/inngest/client";

// Kicks off the Inngest `story/generate.requested` function. Returns a
// jobId immediately — the client polls /api/jobs/[id] until status is
// "done" (result.storyId) or "failed" (error).
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateRequest;
    if (!body.prompt || body.prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }
    const pageCount = Math.min(Math.max(body.pageCount || 5, 3), 12);

    const jobId = await createJob("story.generate");
    await inngest.send({
      name: "story/generate.requested",
      data: { jobId, prompt: body.prompt, pageCount },
    });

    return NextResponse.json({ jobId }, { status: 202 });
  } catch (err) {
    console.error("[generate] enqueue failed:", err);
    return NextResponse.json(
      { error: "Failed to enqueue story generation" },
      { status: 500 }
    );
  }
}
