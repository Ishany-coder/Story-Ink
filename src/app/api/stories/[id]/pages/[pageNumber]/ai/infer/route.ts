import { NextResponse } from "next/server";
import { createJob } from "@/lib/jobs";
import { inngest } from "@/inngest/client";
import { assertOwnsStory, getCurrentUser } from "@/lib/supabase-server";
import type { AssistTarget } from "@/lib/gemini";

export const maxDuration = 10;

interface Body {
  prompt: string;
  globalSystemPrompt?: string | null;
  targets?: AssistTarget[];
}

function sanitizeTargets(v: unknown): AssistTarget[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: AssistTarget[] = [];
  for (const t of v) {
    if (t === "text" || t === "image") {
      if (!out.includes(t)) out.push(t);
    }
  }
  return out.length > 0 ? out : undefined;
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/stories/[id]/pages/[pageNumber]/ai/infer">
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

  const jobId = await createJob("assist.infer", user.id);
  await inngest.send({
    name: "assist/infer.requested",
    data: {
      jobId,
      storyId: id,
      pageNumber: pageNum,
      prompt: userPrompt,
      globalSystemPrompt: body.globalSystemPrompt ?? null,
      targets: sanitizeTargets(body.targets),
    },
  });
  return NextResponse.json({ jobId }, { status: 202 });
}
