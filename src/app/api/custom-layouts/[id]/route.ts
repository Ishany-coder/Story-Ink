import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/supabase-server";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/custom-layouts/[id]">
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await ctx.params;

  // Owner check inline so we don't 500 on a missing-row delete: only
  // allow deletion of layouts the caller owns.
  const { error } = await supabaseAdmin()
    .from("custom_layouts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[custom-layouts] delete failed:", error);
    return NextResponse.json(
      { error: "Failed to delete layout" },
      { status: 500 }
    );
  }

  return new NextResponse(null, { status: 204 });
}
