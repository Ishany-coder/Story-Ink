import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { assertOwnsStory, getCurrentUser } from "@/lib/supabase-server";

// Maximum title length. Matches the wizard's step-2 input maxLength
// (120) so a title that fit through the wizard always fits the editor.
const TITLE_MAX_LEN = 120;

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/stories/[id]">
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const denied = await assertOwnsStory(id, user.id);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch = body as { title?: unknown };

  // Currently only `title` is mutable here. Other story fields have
  // their own dedicated endpoints (pages → update_story_page_fields
  // RPC, ai_system_prompt → ai-system-prompt route, etc.).
  if (typeof patch.title !== "string") {
    return NextResponse.json(
      { error: "title (string) required" },
      { status: 400 }
    );
  }

  const trimmed = patch.title.trim();
  if (trimmed.length === 0) {
    return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
  }
  if (trimmed.length > TITLE_MAX_LEN) {
    return NextResponse.json(
      { error: `title must be ${TITLE_MAX_LEN} characters or fewer` },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin()
    .from("stories")
    .update({ title: trimmed })
    .eq("id", id);

  if (error) {
    console.error("[stories PATCH] supabase update failed:", error);
    return NextResponse.json(
      { error: "Failed to update story" },
      { status: 500 }
    );
  }

  return NextResponse.json({ title: trimmed });
}

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
