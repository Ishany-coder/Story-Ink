import { NextResponse, type NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/supabase-server";
import {
  deleteDraftForUser,
  getDraftForUser,
  updateDraftForUser,
} from "@/lib/drafts";
import type { WizardPayload } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const draft = await getDraftForUser(id, user.id);
    if (!draft) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ draft });
  } catch (err) {
    if (err instanceof UnauthorizedError)
      return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      current_step?: number;
      payload?: WizardPayload;
    };
    const draft = await updateDraftForUser(id, user.id, body);
    return NextResponse.json({ draft });
  } catch (err) {
    if (err instanceof UnauthorizedError)
      return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await deleteDraftForUser(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError)
      return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
