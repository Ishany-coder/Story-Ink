// Thin wrapper around the `jobs` table used by the Inngest-backed Gemini
// pipeline. HTTP routes create jobs (status=queued) + send an Inngest
// event. Inngest functions move jobs through running → done|failed. The
// client polls /api/jobs/[id] to surface results.

import { supabaseAdmin } from "@/lib/supabase";

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface JobRow {
  id: string;
  type: string;
  status: JobStatus;
  result: unknown;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export async function createJob(
  type: string,
  userId: string | null = null
): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .from("jobs")
    .insert({ type, status: "queued", user_id: userId })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    console.error("[jobs] create failed:", error);
    throw new Error("Failed to create job");
  }
  return data.id;
}

export async function markRunning(jobId: string): Promise<void> {
  await supabaseAdmin()
    .from("jobs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

// Write a partial-progress payload while the job is still running.
// The polling client (useJobPolling) surfaces this as state.kind ===
// "running" so the UI can show "page N of M" without a separate
// channel.
export async function markProgress(
  jobId: string,
  result: unknown
): Promise<void> {
  await supabaseAdmin()
    .from("jobs")
    .update({
      status: "running",
      result,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

export async function markDone(jobId: string, result: unknown): Promise<void> {
  await supabaseAdmin()
    .from("jobs")
    .update({
      status: "done",
      result,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

export async function markFailed(
  jobId: string,
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await supabaseAdmin()
    .from("jobs")
    .update({
      status: "failed",
      error: message.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

export async function readJob(jobId: string): Promise<JobRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("jobs")
    .select("id, type, status, result, error, created_at, updated_at")
    .eq("id", jobId)
    .single<JobRow>();
  if (error || !data) return null;
  return data;
}
