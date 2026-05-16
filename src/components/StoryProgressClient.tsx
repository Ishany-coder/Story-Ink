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

// Logical pipeline stages surfaced in the UI. These intentionally don't
// map 1:1 to Inngest job status values — they're a friendlier narrative
// for the user. See deriveStage() for how a job state collapses into one.
type Stage = 1 | 2 | 3 | 4;

const STAGES: { id: Stage; title: string; running: string; done: string }[] = [
  {
    id: 1,
    title: "Crafting story script",
    running: "Writing your story…",
    done: "Story script ready",
  },
  {
    id: 2,
    title: "Generating cast portraits",
    running: "Painting the cast…",
    done: "Cast portraits ready",
  },
  {
    id: 3,
    title: "Awaiting cast approval",
    running: "Cast ready — taking you to approval…",
    done: "Cast approved",
  },
  {
    id: 4,
    title: "Generating pages",
    running: "Generating page art…",
    done: "Pages ready",
  },
];

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
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 text-red-900 p-5">
        <div className="font-medium mb-1">Something went wrong.</div>
        <div className="text-sm">{state.error}</div>
      </div>
    );
  }

  const activeStage = deriveStage(state);
  const message =
    STAGES.find((s) => s.id === activeStage)?.running ?? "Working…";

  return (
    <div className="rounded-2xl border border-cream-300 bg-cream-50 p-6 sm:p-8 shadow-[0_1px_2px_rgba(14,26,43,0.04)]">
      <Stepper activeStage={activeStage} />

      <div className="mt-7 flex items-center gap-3">
        <span className="relative inline-flex h-2.5 w-2.5">
          <span className="absolute inset-0 rounded-full bg-moss-700 animate-ping opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-moss-700" />
        </span>
        <p className="text-ink-700 text-base">{message}</p>
      </div>

      <p className="mt-3 text-sm text-ink-300">
        You can leave this tab open — we&apos;ll move you forward automatically
        when each stage finishes.
      </p>
    </div>
  );
}

// Inspect the live job state and collapse it into one of the four
// narrative stages above. Defensive about `state.result` since it's
// typed as `unknown` (the API hands back whatever Inngest stored).
function deriveStage(state: JobState): Stage {
  if (state.kind === "loading" || state.kind === "queued") return 1;
  if (state.kind === "awaiting_cast_approval") return 3;
  if (state.kind === "done") return 4;
  if (state.kind === "running") {
    const result = state.result;
    if (result && typeof result === "object" && "stage" in result) {
      const stage = (result as { stage?: unknown }).stage;
      // Stage values match what `src/inngest/functions.ts` writes via
      // markDone/awaiting payloads (see lines ~708, ~825).
      if (stage === "awaiting_cast_approval") return 3;
      if (stage === "pages" || stage === "generating_pages") return 4;
      if (stage === "cast_portraits") return 2;
      if (stage === "script") return 1;
    }
    // No stage hint yet — Stage 1 is the default running state.
    return 1;
  }
  return 1;
}

function Stepper({ activeStage }: { activeStage: Stage }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3">
      {STAGES.map((s, i) => {
        const isDone = s.id < activeStage;
        const isActive = s.id === activeStage;
        return (
          <li key={s.id} className="flex-1 min-w-0">
            <div className="flex items-center gap-2 sm:gap-3">
              <span
                className={`relative shrink-0 flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
                  isDone
                    ? "bg-moss-700 border-moss-700 text-cream-50"
                    : isActive
                    ? "bg-cream-50 border-moss-700 text-moss-700"
                    : "bg-cream-50 border-cream-300 text-ink-300"
                }`}
              >
                {isDone ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                ) : (
                  s.id
                )}
                {isActive && (
                  <span className="absolute inset-0 rounded-full ring-4 ring-moss-700/15 animate-pulse" />
                )}
              </span>
              {i < STAGES.length - 1 && (
                <span
                  className={`h-0.5 flex-1 rounded-full transition-colors ${
                    isDone
                      ? "bg-moss-700"
                      : isActive
                      ? "bg-gradient-to-r from-moss-700 to-cream-200 animate-pulse"
                      : "bg-cream-200"
                  }`}
                />
              )}
            </div>
            <div
              className={`mt-2 text-[11px] sm:text-xs leading-tight ${
                isDone
                  ? "text-moss-900 font-medium"
                  : isActive
                  ? "text-ink-900 font-medium"
                  : "text-ink-300"
              }`}
            >
              {s.title}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
