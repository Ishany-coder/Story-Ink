import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/stories/[id]">
) {
  const { id } = await ctx.params;

  const { error } = await supabase.from("stories").delete().eq("id", id);

  if (error) {
    console.error("Supabase delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete story" },
      { status: 500 }
    );
  }

  return new NextResponse(null, { status: 204 });
}
