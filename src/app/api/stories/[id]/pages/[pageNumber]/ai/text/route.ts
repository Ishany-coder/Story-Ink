import { NextResponse } from "next/server";
import { createJob } from "@/lib/jobs";
import { inngest } from "@/inngest/client";
import { assertOwnsStory, getCurrentUser } from "@/lib/supabase-server";
import { enforceRateLimit, LIMITS, userKey } from "@/lib/rate-limit";

export const maxDuration = 10;

// Hard cap on user-supplied prompt fields. Defends against prompt-
// injection payload bloat + Gemini token waste.
const MAX_PROMPT_LEN = 2000;
const MAX_SYSTEM_PROMPT_LEN = 2000;

interface Body {
  prompt: string;
  globalSystemPrompt?: string | null;
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/stories/[id]/pages/[pageNumber]/ai/text">
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const limited = await enforceRateLimit({
    ...LIMITS.assist,
    key: userKey("assist", user.id),
  });
  if (limited) return limited;
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
  const userPrompt = body.prompt?.trim().slice(0, MAX_PROMPT_LEN);
  if (!userPrompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }
  const globalSystemPrompt = body.globalSystemPrompt
    ? String(body.globalSystemPrompt).slice(0, MAX_SYSTEM_PROMPT_LEN)
    : null;

  const jobId = await createJob("assist.text", user.id);
  await inngest.send({
    name: "assist/text.requested",
    data: {
      jobId,
      userId: user.id,
      storyId: id,
      pageNumber: pageNum,
      prompt: userPrompt,
      globalSystemPrompt,
    },
  });
  return NextResponse.json({ jobId }, { status: 202 });
}
