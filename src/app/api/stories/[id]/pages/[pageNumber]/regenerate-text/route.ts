import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { regeneratePageText } from "@/lib/gemini";
import type { Story, StoryPage, Layer } from "@/lib/types";

export const maxDuration = 60;

// Regenerate just the narration text for one page. Updates both page.text
// (so the reader stays in sync) and the layout-tagged text layer inside
// page.overlays (so the studio reflects it without the parent re-opening).
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

  const { data: story, error: fetchErr } = await supabase
    .from("stories")
    .select("id, title, pages")
    .eq("id", id)
    .single<Pick<Story, "id" | "title" | "pages">>();

  if (fetchErr || !story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  const page = story.pages.find((p) => p.pageNumber === pageNum);
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  let text: string;
  try {
    text = await regeneratePageText(
      story.title,
      story.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })),
      pageNum
    );
  } catch (err) {
    console.error("[regenerate-text] gemini failed:", err);
    return NextResponse.json(
      { error: "Regeneration failed" },
      { status: 500 }
    );
  }

  const nextPages: StoryPage[] = story.pages.map((p) => {
    if (p.pageNumber !== pageNum) return p;
    const overlays = (p.overlays ?? []).map((l): Layer =>
      l.source === "layout" && l.type === "text" ? { ...l, text } : l
    );
    return { ...p, text, overlays };
  });

  const { error: updateErr } = await supabase
    .from("stories")
    .update({ pages: nextPages })
    .eq("id", id);

  if (updateErr) {
    console.error("[regenerate-text] persist failed:", updateErr);
    return NextResponse.json(
      { error: "Failed to save regenerated text" },
      { status: 500 }
    );
  }

  return NextResponse.json({ text });
}
