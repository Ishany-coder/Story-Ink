"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Lightweight polling client for the /api/jobs/[id] endpoint. Call
// `start(jobId)` to begin polling; the hook resolves to `done` / `failed`
// and reports the result/error the Inngest function wrote to the row.
//
// Poll cadence: 1s — fast enough for short calls, slow enough that a few
// dozen concurrent polls won't hammer Supabase.

export type JobState<TResult> =
  | { kind: "idle" }
  | { kind: "polling"; jobId: string }
  | { kind: "done"; jobId: string; result: TResult }
  | { kind: "failed"; jobId: string; error: string };

const POLL_INTERVAL_MS = 1000;
// Give long stories ~5 minutes before we give up. Inngest itself keeps
// running — the client just stops polling.
const MAX_POLL_ATTEMPTS = 300;

interface JobRow<TResult> {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  result: TResult | null;
  error: string | null;
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
      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
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
          }
        } catch (err) {
          // Network blips: try again next tick. Only bail if we exhaust
          // attempts.
          console.warn("[jobs] poll error:", err);
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      if (!cancelRef.current) {
        setState({
          kind: "failed",
          jobId,
          error: "Job didn't finish in time. Check back later.",
        });
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
