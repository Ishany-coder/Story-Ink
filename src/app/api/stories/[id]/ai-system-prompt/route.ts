import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const maxDuration = 15;

interface Body {
  systemPrompt: string | null;
}

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/stories/[id]/ai-system-prompt">
) {
  const { id } = await ctx.params;
  const body = (await request.json()) as Body;

  const trimmed =
    typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : null;
  const value = trimmed ? trimmed : null;

  const { error } = await supabase
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
