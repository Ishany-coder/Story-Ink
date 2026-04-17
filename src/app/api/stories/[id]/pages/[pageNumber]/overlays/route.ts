import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Layer, Story, StoryPage } from "@/lib/types";

export const maxDuration = 30;

interface SaveBody {
  overlays: Layer[];
  layoutId?: string;
}

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/stories/[id]/pages/[pageNumber]/overlays">
) {
  const { id, pageNumber } = await ctx.params;
  const pageNum = Number(pageNumber);

  if (!Number.isFinite(pageNum)) {
    return NextResponse.json(
      { error: "Invalid page number" },
      { status: 400 }
    );
  }

  const body = (await request.json()) as SaveBody;
  if (!Array.isArray(body.overlays)) {
    return NextResponse.json(
      { error: "overlays must be an array" },
      { status: 400 }
    );
  }

  const { data: story, error: fetchErr } = await supabase
    .from("stories")
    .select("id, pages")
    .eq("id", id)
    .single<Pick<Story, "id" | "pages">>();

  if (fetchErr || !story) {
    console.error("[overlays] fetch failed:", fetchErr);
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  const nextPages: StoryPage[] = story.pages.map((p) =>
    p.pageNumber === pageNum
      ? {
          ...p,
          overlays: body.overlays,
          ...(body.layoutId ? { layoutId: body.layoutId } : {}),
        }
      : p
  );

  const { error: updateErr } = await supabase
    .from("stories")
    .update({ pages: nextPages })
    .eq("id", id);

  if (updateErr) {
    console.error("[overlays] persist failed:", updateErr);
    return NextResponse.json(
      { error: "Failed to save overlays" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
