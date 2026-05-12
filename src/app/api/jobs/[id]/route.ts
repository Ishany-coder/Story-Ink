import { NextResponse } from "next/server";
import { readJob } from "@/lib/jobs";
import { getCurrentUser } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";

// Thin polling endpoint. Clients hit this on an interval (1-2s) after
// kicking off an AI flow. Returns the current row scoped to the
// authenticated owner; admins can read any job.
//
// Authentication + ownership enforced here because readJob() uses the
// service-role client (bypasses RLS) so RLS won't gate the read.

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/jobs/[id]">
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const row = await readJob(id);
  if (!row) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (row.user_id && row.user_id !== user.id && !isAdminUser(user)) {
    // Treat "someone else's job" as not-found so the route doesn't
    // confirm the id exists for an unrelated caller.
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json(row, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
