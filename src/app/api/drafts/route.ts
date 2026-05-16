import { NextResponse, type NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/supabase-server";
import { createDraftForUser, listDraftsForUser } from "@/lib/drafts";
import type { WizardPayload } from "@/lib/types";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ drafts: await listDraftsForUser(user.id) });
  } catch (err) {
    if (err instanceof UnauthorizedError)
      return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as {
      payload?: Partial<WizardPayload>;
    };
    const draft = await createDraftForUser(user.id, body.payload);
    return NextResponse.json({ draft }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError)
      return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
