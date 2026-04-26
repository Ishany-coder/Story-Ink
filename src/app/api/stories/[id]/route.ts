import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { assertOwnsStory, getCurrentUser } from "@/lib/supabase-server";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/stories/[id]">
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const denied = await assertOwnsStory(id, user.id);
  if (denied) return denied;

  const { error } = await supabaseAdmin().from("stories").delete().eq("id", id);

  if (error) {
    console.error("Supabase delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete story" },
      { status: 500 }
    );
  }

  return new NextResponse(null, { status: 204 });
}
