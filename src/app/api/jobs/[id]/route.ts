import { NextResponse } from "next/server";
import { readJob } from "@/lib/jobs";

// Thin polling endpoint. Clients hit this on an interval (1-2s) after
// kicking off an AI flow. Returns the current row verbatim; client
// interprets `status` + `result` / `error`.

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/jobs/[id]">
) {
  const { id } = await ctx.params;
  const row = await readJob(id);
  if (!row) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}
