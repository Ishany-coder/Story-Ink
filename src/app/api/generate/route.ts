import { NextRequest, NextResponse } from "next/server";
import { generateStoryText, generatePageImage } from "@/lib/gemini";
import { buildInitialOverlays, DEFAULT_LAYOUT_ID } from "@/lib/layouts";
import { supabase, uploadGeneratedImage } from "@/lib/supabase";
import { GenerateRequest, StoryPage } from "@/lib/types";

export const maxDuration = 300;

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

    const storyText = await generateStoryText(body.prompt, pageCount);
    const title = storyText.title;
    const scriptPages = storyText.pages.map((p) => ({
      pageNumber: p.pageNumber,
      text: p.text,
    }));

    const imageResults = await Promise.allSettled(
      scriptPages.map((page) => generatePageImage(page.text, title))
    );

    const imageUrls = await Promise.all(
      imageResults.map(async (res) => {
        if (res.status !== "fulfilled" || !res.value) return "";
        try {
          return await uploadGeneratedImage(res.value);
        } catch (err) {
          console.error("[generate] image upload to Storage failed:", err);
          return "";
        }
      })
    );

    const pages: StoryPage[] = scriptPages.map((page, i) => {
      const imageUrl = imageUrls[i];
      return {
        pageNumber: page.pageNumber,
        text: page.text,
        imageUrl,
        layoutId: DEFAULT_LAYOUT_ID,
        overlays: buildInitialOverlays(imageUrl, page.text),
      };
    });

    const coverImage = pages[0]?.imageUrl || null;

    const { data, error } = await supabase
      .from("stories")
      .insert({
        title,
        prompt: body.prompt,
        page_count: pageCount,
        pages,
        cover_image: coverImage,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json(
        { error: "Failed to save story" },
        { status: 500 }
      );
    }

    return NextResponse.json({ storyId: data.id }, { status: 201 });
  } catch (err) {
    console.error("Generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate story" },
      { status: 500 }
    );
  }
}
