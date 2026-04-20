import { NextResponse } from "next/server";
import { supabase, uploadGeneratedImage } from "@/lib/supabase";
import { assistRegenerateImage } from "@/lib/gemini";
import type { Story } from "@/lib/types";

export const maxDuration = 120;

interface Body {
  prompt: string;
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
  ctx: RouteContext<"/api/stories/[id]/pages/[pageNumber]/ai/image">
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

  let dataUri: string;
  try {
    dataUri = await assistRegenerateImage({
      systemPrompt: composeSystemPrompt(
        body.globalSystemPrompt,
        story.ai_system_prompt
      ),
      storyTitle: story.title,
      storyPrompt: story.prompt,
      pageText: page.text,
      userPrompt,
      currentImageUrl: page.imageUrl,
    });
  } catch (err) {
    console.error("[ai/image] gemini failed:", err);
    return NextResponse.json(
      { error: "Image generation failed" },
      { status: 500 }
    );
  }

  try {
    const imageUrl = await uploadGeneratedImage(dataUri);
    return NextResponse.json({ imageUrl });
  } catch (err) {
    console.error("[ai/image] storage upload failed:", err);
    return NextResponse.json(
      { error: "Failed to save generated image" },
      { status: 500 }
    );
  }
}
