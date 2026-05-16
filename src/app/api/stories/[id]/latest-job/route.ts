import { NextResponse, type NextRequest } from "next/server";
import {
  requireUser,
  assertOwnsStory,
  UnauthorizedError,
} from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

type RouteContext = { params: Promise<{ id: string }> };

interface JobResultLite {
  storyId?: string;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const ownership = await assertOwnsStory(id, user.id);
    if (ownership) return ownership;

    // Newest job for this user that references this story (V2 jobs stash
    // storyId in `result.storyId` from generateStoryV2Fn's first write).
    const { data: jobs } = await supabaseAdmin()
      .from("jobs")
      .select("id, status, result, error, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    const match = (jobs ?? []).find((j) => {
      const r = j.result as JobResultLite | null;
      return r?.storyId === id;
    });
    if (!match) return NextResponse.json({ error: "no job" }, { status: 404 });
    return NextResponse.json(match);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
