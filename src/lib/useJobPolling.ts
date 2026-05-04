"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Lightweight polling client for the /api/jobs/[id] endpoint. Call
// `start(jobId)` to begin polling; the hook resolves to `done` / `failed`
// and reports the result/error the Inngest function wrote to the row.
//
// Poll cadence: 1s — fast enough for short calls, slow enough that a few
// dozen concurrent polls won't hammer Supabase.

// "running" carries any partial result the Inngest function has
// written so far — story generation uses this to surface "Drawing
// page 4 of 10..." style progress without a separate channel.
//
// "stalled" means we exhausted our poll budget but the job is almost
// certainly still running on the Inngest worker; the caller should
// surface this as info (check back later) not as a failure.
export type JobState<TResult> =
  | { kind: "idle" }
  | { kind: "polling"; jobId: string }
  | { kind: "running"; jobId: string; result: unknown | null }
  | { kind: "done"; jobId: string; result: TResult }
  | { kind: "failed"; jobId: string; error: string }
  | { kind: "stalled"; jobId: string };

// Adaptive poll cadence so a 30-minute story doesn't burn 1800 polls
// at 1Hz. First minute: every 1s for snappy feedback on short stories.
// Then 3s. After ten minutes: 10s — at that point the user is hardly
// watching it tick.
function pollIntervalMs(attempt: number): number {
  if (attempt < 60) return 1_000;
  if (attempt < 260) return 3_000;
  return 10_000;
}

// Give long stories an hour before we give up watching. The Inngest
// worker keeps running regardless — the client just stops polling and
// the caller can point the user at their dashboard.
const MAX_WALL_MS = 60 * 60 * 1000;

interface JobRow<TResult> {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  result: TResult | null;
  error: string | null;
}

// Avoid spamming setState with the same partial-progress object on
// every poll. Equality here is shallow JSON — fine because progress
// payloads are tiny.
function shallowJsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function useJobPolling<TResult>() {
  const [state, setState] = useState<JobState<TResult>>({ kind: "idle" });
  const cancelRef = useRef(false);

  const reset = useCallback(() => {
    cancelRef.current = true;
    setState({ kind: "idle" });
  }, []);

  const start = useCallback((jobId: string) => {
    cancelRef.current = false;
    setState({ kind: "polling", jobId });

    (async () => {
      let lastProgress: unknown = null;
      const startedAt = Date.now();
      let attempt = 0;
      while (Date.now() - startedAt < MAX_WALL_MS) {
        if (cancelRef.current) return;
        try {
          const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
          if (res.ok) {
            const row = (await res.json()) as JobRow<TResult>;
            if (row.status === "done") {
              if (!cancelRef.current) {
                setState({
                  kind: "done",
                  jobId,
                  result: (row.result ?? null) as TResult,
                });
              }
              return;
            }
            if (row.status === "failed") {
              if (!cancelRef.current) {
                setState({
                  kind: "failed",
                  jobId,
                  error: row.error ?? "Job failed",
                });
              }
              return;
            }
            if (row.status === "running") {
              if (
                !cancelRef.current &&
                !shallowJsonEqual(row.result, lastProgress)
              ) {
                lastProgress = row.result;
                setState({
                  kind: "running",
                  jobId,
                  result: row.result ?? null,
                });
              }
            }
          }
        } catch (err) {
          // Network blips: try again next tick. Only bail if we exhaust
          // the wall budget.
          console.warn("[jobs] poll error:", err);
        }
        await new Promise((r) => setTimeout(r, pollIntervalMs(attempt)));
        attempt++;
      }
      if (!cancelRef.current) {
        // Don't call this a failure — Inngest is almost certainly still
        // chewing through pages. The caller decides what to render
        // (we recommend "check your dashboard in a few minutes").
        setState({ kind: "stalled", jobId });
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, []);

  return { state, start, reset };
}
