import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/custom-layouts/[id]">
) {
  const { id } = await ctx.params;

  const { error } = await supabase
    .from("custom_layouts")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[custom-layouts] delete failed:", error);
    return NextResponse.json(
      { error: "Failed to delete layout" },
      { status: 500 }
    );
  }

  return new NextResponse(null, { status: 204 });
}
