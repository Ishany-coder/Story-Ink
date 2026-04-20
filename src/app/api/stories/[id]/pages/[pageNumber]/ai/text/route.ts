import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { assistRegenerateText } from "@/lib/gemini";
import type { Story } from "@/lib/types";

export const maxDuration = 60;

interface Body {
  prompt: string;
  // Global (localStorage) prompt from the client. Concatenated with the
  // story's ai_system_prompt before being sent to Gemini.
  globalSystemPrompt?: string | null;
}

function composeSystemPrompt(
  global: string | null | undefined,
  perStory: string | null | undefined
): string | null {
  const g = global?.trim();
  const s = perStory?.trim();
  if (g && s) return `${g}\n\n${s}`;
  return g || s || null;
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

  const { data: story, error: fetchErr } = await supabase
    .from("stories")
    .select("id, title, prompt, pages, ai_system_prompt")
    .eq("id", id)
    .single<
      Pick<Story, "id" | "title" | "prompt" | "pages" | "ai_system_prompt">
    >();

  if (fetchErr || !story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  const page = story.pages.find((p) => p.pageNumber === pageNum);
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  try {
    const text = await assistRegenerateText({
      systemPrompt: composeSystemPrompt(
        body.globalSystemPrompt,
        story.ai_system_prompt
      ),
      storyTitle: story.title,
      storyPrompt: story.prompt,
      allPages: story.pages.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.text,
      })),
      targetPageNumber: pageNum,
      userPrompt,
      currentImageUrl: page.imageUrl,
    });
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[ai/text] gemini failed:", err);
    return NextResponse.json(
      { error: "Text generation failed" },
      { status: 500 }
    );
  }
}
