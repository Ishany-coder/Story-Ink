"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Portrait = { characterId: string; name: string; portraitUrl: string };

// Per-character regenerate state. We key by characterId so multiple
// tiles can regenerate concurrently — rare in practice but free here.
type RegenRow = {
  jobId: string;
  status: "regenerating" | "failed";
  error?: string;
};

export default function ApproveCastClient({
  storyId,
  portraits: initialPortraits,
}: {
  storyId: string;
  portraits: Portrait[];
}) {
  const router = useRouter();
  // Portraits are stateful so a successful regenerate can swap a single
  // tile's URL without bouncing through router.refresh().
  const [portraits, setPortraits] = useState<Portrait[]>(initialPortraits);
  const [regenById, setRegenById] = useState<Record<string, RegenRow>>({});
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Set on unmount so in-flight pollers stop calling setState on a
  // disposed component. Necessary because we navigate away on approve.
  const cancelledRef = useRef(false);
  useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    []
  );

  const anyRegenerating = Object.values(regenById).some(
    (r) => r.status === "regenerating"
  );

  async function pollUntilDone(jobId: string, characterId: string) {
    // ~90s budget at 1.5s per tick. Comfortably above typical Gemini
    // image-generation latency (~20-40s) but short enough that a stuck
    // job surfaces a clear timeout error instead of polling forever.
    const MAX_ATTEMPTS = 60;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (cancelledRef.current) return;
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (res.ok) {
          const job = (await res.json()) as {
            status: string;
            result?: { portraitUrl?: string } | null;
            error?: string | null;
          };
          if (job.status === "done") {
            const newUrl = job.result?.portraitUrl;
            if (newUrl) {
              setPortraits((prev) =>
                prev.map((p) =>
                  p.characterId === characterId
                    ? { ...p, portraitUrl: newUrl }
                    : p
                )
              );
            }
            setRegenById((m) => {
              const next = { ...m };
              delete next[characterId];
              return next;
            });
            return;
          }
          if (job.status === "failed") {
            setRegenById((m) => ({
              ...m,
              [characterId]: {
                jobId,
                status: "failed",
                error: job.error ?? "regenerate failed",
              },
            }));
            return;
          }
        }
      } catch {
        // transient — keep trying
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (cancelledRef.current) return;
    setRegenById((m) => ({
      ...m,
      [characterId]: {
        jobId,
        status: "failed",
        error: "Timed out waiting for portrait. Try again.",
      },
    }));
  }

  async function regenerate(characterId: string) {
    if (regenById[characterId]?.status === "regenerating") return;
    setError(null);
    // Optimistic state with empty jobId; replaced once POST returns.
    setRegenById((m) => ({
      ...m,
      [characterId]: { jobId: "", status: "regenerating" },
    }));

    let jobId: string;
    try {
      const res = await fetch(
        `/api/stories/${storyId}/cast/${characterId}/regenerate`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as { jobId: string };
      jobId = body.jobId;
      setRegenById((m) => ({
        ...m,
        [characterId]: { jobId, status: "regenerating" },
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "regen failed";
      setRegenById((m) => ({
        ...m,
        [characterId]: { jobId: "", status: "failed", error: msg },
      }));
      return;
    }
    void pollUntilDone(jobId, characterId);
  }

  async function approveAll() {
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`/api/stories/${storyId}/approve-cast`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(`/stories/${storyId}/progress`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "approve failed");
      setApproving(false);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {portraits.map((p) => {
          const regen = regenById[p.characterId];
          const isRegenerating = regen?.status === "regenerating";
          return (
            <div
              key={p.characterId}
              className="border rounded-lg overflow-hidden bg-white"
            >
              <div className="relative aspect-square bg-stone-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.portraitUrl}
                  alt={p.name}
                  className="w-full h-full object-cover"
                />
                {isRegenerating && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-cream-50/80 backdrop-blur-sm">
                    <Spinner />
                    <span className="text-xs font-medium text-ink-700">
                      Regenerating…
                    </span>
                  </div>
                )}
              </div>
              <div className="p-3 flex items-center justify-between">
                <span className="font-medium">{p.name}</span>
                <button
                  type="button"
                  onClick={() => regenerate(p.characterId)}
                  disabled={isRegenerating}
                  className="text-sm underline disabled:opacity-50"
                >
                  {isRegenerating ? "Working…" : "Regenerate"}
                </button>
              </div>
              {regen?.status === "failed" && (
                <div className="px-3 pb-2 text-xs text-rose-600">
                  {regen.error}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <div className="text-red-600 text-sm mb-3">{error}</div>}

      <button
        type="button"
        onClick={approveAll}
        disabled={approving || anyRegenerating}
        className="px-6 py-3 bg-black text-white rounded text-lg disabled:opacity-50"
        title={
          anyRegenerating
            ? "Wait for portraits to finish regenerating"
            : undefined
        }
      >
        {approving ? "Sending…" : "Approve all & generate pages"}
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className="h-7 w-7 animate-spin text-moss-700"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
