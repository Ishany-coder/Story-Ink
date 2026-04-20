import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Persist a user-uploaded image URL into stories.library_images so the
// Studio's Images tab and picker keep showing it even after every layer
// that referenced it has been deleted.

interface Row {
  library_images: string[] | null;
}

async function readLibrary(id: string): Promise<string[] | null> {
  const { data, error } = await supabase
    .from("stories")
    .select("library_images")
    .eq("id", id)
    .single<Row>();
  if (error || !data) return null;
  return data.library_images ?? [];
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/stories/[id]/library">
) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { url?: unknown };

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const current = await readLibrary(id);
  if (current === null) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  // Idempotent: dedupe by URL.
  const next = current.includes(url) ? current : [...current, url];

  const { error } = await supabase
    .from("stories")
    .update({ library_images: next })
    .eq("id", id);

  if (error) {
    console.error("[library] append failed:", error);
    const hint = error.message ?? "Failed to save image to library";
    return NextResponse.json({ error: hint }, { status: 500 });
  }

  return NextResponse.json({ libraryImages: next });
}

export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/stories/[id]/library">
) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { url?: unknown };

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const current = await readLibrary(id);
  if (current === null) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  const next = current.filter((u) => u !== url);

  const { error } = await supabase
    .from("stories")
    .update({ library_images: next })
    .eq("id", id);

  if (error) {
    console.error("[library] remove failed:", error);
    return NextResponse.json(
      { error: error.message ?? "Failed to remove from library" },
      { status: 500 }
    );
  }

  return NextResponse.json({ libraryImages: next });
}
