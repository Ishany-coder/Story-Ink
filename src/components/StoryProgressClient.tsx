"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type JobState =
  | { kind: "loading" }
  | { kind: "queued" }
  | { kind: "running"; result: unknown }
  | { kind: "awaiting_cast_approval" }
  | { kind: "done"; storyId: string }
  | { kind: "failed"; error: string };

export default function StoryProgressClient({ storyId }: { storyId: string }) {
  const router = useRouter();
  const [state, setState] = useState<JobState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      while (!cancelled) {
        try {
          const res = await fetch(`/api/stories/${storyId}/latest-job`, {
            cache: "no-store",
          });
          if (!res.ok) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          const job = (await res.json()) as {
            id: string;
            status: string;
            result?: unknown;
            error?: string | null;
          };
          if (cancelled) return;
          if (job.status === "awaiting_cast_approval") {
            setState({ kind: "awaiting_cast_approval" });
            router.push(`/stories/${storyId}/approve-cast`);
            return;
          }
          if (job.status === "done") {
            setState({ kind: "done", storyId });
            router.push(`/read/${storyId}`);
            return;
          }
          if (job.status === "failed") {
            setState({ kind: "failed", error: job.error ?? "unknown error" });
            return;
          }
          setState({ kind: "running", result: job.result });
          await new Promise((r) => setTimeout(r, 2000));
        } catch {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    }
    poll();
    return () => {
      cancelled = true;
    };
  }, [storyId, router]);

  if (state.kind === "failed") {
    return <div className="text-red-600">Failed: {state.error}</div>;
  }
  if (state.kind === "awaiting_cast_approval") {
    return <div>Cast ready — redirecting to approval…</div>;
  }
  return (
    <div className="space-y-2">
      <div>Working…</div>
      <pre className="text-xs bg-stone-100 p-3 rounded overflow-auto">
        {JSON.stringify(state, null, 2)}
      </pre>
    </div>
  );
}
