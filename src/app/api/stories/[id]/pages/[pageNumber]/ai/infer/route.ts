import { NextResponse } from "next/server";
import { createJob } from "@/lib/jobs";
import { inngest } from "@/inngest/client";
import { assertOwnsStory, getCurrentUser } from "@/lib/supabase-server";
import { enforceRateLimit, LIMITS, userKey } from "@/lib/rate-limit";
import {
  containsProfanity,
  PROFANITY_REJECTION_MESSAGE,
} from "@/lib/profanity";
import type { AssistTarget } from "@/lib/gemini";

export const maxDuration = 10;

const MAX_PROMPT_LEN = 2000;
const MAX_SYSTEM_PROMPT_LEN = 2000;

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
  if (containsProfanity(userPrompt)) {
    return NextResponse.json(
      { error: PROFANITY_REJECTION_MESSAGE },
      { status: 400 }
    );
  }
  const globalSystemPrompt = body.globalSystemPrompt
    ? String(body.globalSystemPrompt).slice(0, MAX_SYSTEM_PROMPT_LEN)
    : null;
  // globalSystemPrompt is concatenated into every Gemini call by
  // composeSystemPrompt. Gate it through the same filter so users
  // can't bypass the userPrompt check by moving offending content
  // into the localStorage-backed global prompt.
  if (globalSystemPrompt && containsProfanity(globalSystemPrompt)) {
    return NextResponse.json(
      { error: PROFANITY_REJECTION_MESSAGE },
      { status: 400 }
    );
  }

  const jobId = await createJob("assist.infer", user.id);
  await inngest.send({
    name: "assist/infer.requested",
    data: {
      jobId,
      userId: user.id,
      storyId: id,
      pageNumber: pageNum,
      prompt: userPrompt,
      globalSystemPrompt,
      targets: sanitizeTargets(body.targets),
    },
  });
  return NextResponse.json({ jobId }, { status: 202 });
}
