import { NextResponse } from "next/server";
import { updateStoryPageFields } from "@/lib/supabase";
import { assertOwnsStory, getCurrentUser } from "@/lib/supabase-server";
import type { Layer } from "@/lib/types";

export const maxDuration = 30;

interface SaveBody {
  overlays: Layer[];
  layoutId?: string;
}

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/stories/[id]/pages/[pageNumber]/overlays">
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id, pageNumber } = await ctx.params;
  const pageNum = Number(pageNumber);

  if (!Number.isFinite(pageNum)) {
    return NextResponse.json(
      { error: "Invalid page number" },
      { status: 400 }
    );
  }

  const denied = await assertOwnsStory(id, user.id);
  if (denied) return denied;

  const body = (await request.json()) as SaveBody;
  if (!Array.isArray(body.overlays)) {
    return NextResponse.json(
      { error: "overlays must be an array" },
      { status: 400 }
    );
  }

  try {
    await updateStoryPageFields(id, pageNum, {
      overlays: body.overlays,
      ...(body.layoutId ? { layoutId: body.layoutId } : {}),
    });
  } catch (err) {
    console.error("[overlays] persist failed:", err);
    const msg = err instanceof Error ? err.message : String(err);
    // The RPC raises errcode P0002 for "page not found". Surface that as
    // a 404 so the Studio can recover; anything else is a real 500.
    const notFound = msg.includes("P0002") || msg.toLowerCase().includes("not found");
    return NextResponse.json(
      { error: notFound ? "Page not found" : "Failed to save overlays" },
      { status: notFound ? 404 : 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
