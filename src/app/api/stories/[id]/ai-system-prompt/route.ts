import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { assertOwnsStory, getCurrentUser } from "@/lib/supabase-server";
import {
  containsProfanity,
  PROFANITY_REJECTION_MESSAGE,
} from "@/lib/profanity";

export const maxDuration = 15;

interface Body {
  systemPrompt: string | null;
}

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/stories/[id]/ai-system-prompt">
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const denied = await assertOwnsStory(id, user.id);
  if (denied) return denied;
  const body = (await request.json()) as Body;

  const trimmed =
    typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : null;
  const value = trimmed ? trimmed : null;

  // The per-story system prompt is concatenated with every Gemini call
  // (composeSystemPrompt in src/lib/ai-prompts) — gate it through the
  // same profanity filter as the freeform user prompts.
  if (value && containsProfanity(value)) {
    return NextResponse.json(
      { error: PROFANITY_REJECTION_MESSAGE },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin()
    .from("stories")
    .update({ ai_system_prompt: value })
    .eq("id", id);

  if (error) {
    console.error("[ai-system-prompt] persist failed:", error);
    return NextResponse.json(
      { error: "Failed to save system prompt" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, systemPrompt: value });
}
