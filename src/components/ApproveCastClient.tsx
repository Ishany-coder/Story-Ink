"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type UserPortrait = { characterId: string; name: string; portraitUrl: string };

// Spec A: AI-cast members have a different shape than user-cast —
// no characterId, but with role + kind + an optional user prompt
// addition the pencil-icon editor reads/writes.
type AiPortrait = {
  aiCastId: string;
  name: string;
  roleLabel: string | null;
  kind: "person" | "pet";
  portraitUrl: string;
  promptAddition: string | null;
};

// Spec B: canonical background. Wide-aspect thumbnail in the
// Settings section. Same edit controls as AI cast (rename, pencil
// prompt edit, regenerate, remove-and-rerun).
type Background = {
  bgId: string;
  label: string;
  portraitUrl: string;
  promptAddition: string | null;
};

// Per-character regenerate state. We key by string id (characterId
// for user-cast, aiCastId for AI-cast) so multiple tiles can
// regenerate concurrently — rare in practice but free here.
type RegenRow = {
  jobId: string;
  status: "regenerating" | "failed";
  error?: string;
};

export default function ApproveCastClient({
  storyId,
  portraits: initialPortraits,
  aiPortraits: initialAiPortraits,
  backgrounds: initialBackgrounds,
}: {
  storyId: string;
  portraits: UserPortrait[];
  aiPortraits: AiPortrait[];
  backgrounds?: Background[];
}) {
  const router = useRouter();
  const [portraits, setPortraits] = useState<UserPortrait[]>(initialPortraits);
  const [aiPortraits, setAiPortraits] =
    useState<AiPortrait[]>(initialAiPortraits);
  const [backgrounds, setBackgrounds] = useState<Background[]>(
    initialBackgrounds ?? []
  );
  const [regenById, setRegenById] = useState<Record<string, RegenRow>>({});
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI-cast pencil-editor open state — keyed by aiCastId. Holds the
  // in-progress textarea value so it can be cancelled cleanly.
  const [editingPromptFor, setEditingPromptFor] = useState<string | null>(
    null
  );
  const [promptDraft, setPromptDraft] = useState("");

  // AI-cast inline-rename state. Holds the aiCastId being edited and
  // the in-progress name value.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");

  // Remove-confirmation modal state. Holds the AI-cast row being
  // removed (so we can show its name in the confirmation copy).
  const [pendingRemove, setPendingRemove] = useState<AiPortrait | null>(null);

  // Spec B: parallel state for background editing / removing. Kept
  // separate from AI-cast state so the two sections never share a
  // pencil-editor or rename target.
  const [editingBgPromptFor, setEditingBgPromptFor] = useState<string | null>(
    null
  );
  const [bgPromptDraft, setBgPromptDraft] = useState("");
  const [renamingBgId, setRenamingBgId] = useState<string | null>(null);
  const [bgLabelDraft, setBgLabelDraft] = useState("");
  const [pendingBgRemove, setPendingBgRemove] = useState<Background | null>(
    null
  );

  // True while the Stage-1 re-run is in flight. Full-page overlay
  // blocks interaction so the user can't approve cast that's about
  // to be regenerated.
  const [rerunning, setRerunning] = useState(false);

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

  // Generic job poller. callback({newUrl?}) is invoked with the
  // result.portraitUrl when the job completes successfully, or with
  // newUrl=undefined when the job completes without a URL payload
  // (e.g. the script-rerun flow, where we refresh the page instead).
  async function pollUntilDone(
    jobId: string,
    callback: (params: { newUrl?: string; error?: string }) => void
  ) {
    const MAX_ATTEMPTS = 120; // 3 min budget at 1.5s ticks
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
            callback({ newUrl: job.result?.portraitUrl });
            return;
          }
          if (job.status === "failed") {
            callback({ error: job.error ?? "failed" });
            return;
          }
          if (job.status === "awaiting_cast_approval") {
            // Script-rerun flow finishes by parking the job at
            // awaiting_cast_approval (a new approval gate). Treat as
            // success — caller refreshes the page.
            callback({});
            return;
          }
        }
      } catch {
        // transient — keep trying
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (cancelledRef.current) return;
    callback({ error: "Timed out. Try again." });
  }

  // -------------------- USER-CAST regenerate (unchanged) -----------------

  async function regenerateUser(characterId: string) {
    if (regenById[characterId]?.status === "regenerating") return;
    setError(null);
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
    void pollUntilDone(jobId, ({ newUrl, error: err }) => {
      if (err) {
        setRegenById((m) => ({
          ...m,
          [characterId]: { jobId, status: "failed", error: err },
        }));
        return;
      }
      if (newUrl) {
        setPortraits((prev) =>
          prev.map((p) =>
            p.characterId === characterId ? { ...p, portraitUrl: newUrl } : p
          )
        );
      }
      setRegenById((m) => {
        const next = { ...m };
        delete next[characterId];
        return next;
      });
    });
  }

  // -------------------- AI-CAST regenerate (with optional prompt) --------

  async function regenerateAi(aiCastId: string, promptAddition?: string) {
    if (regenById[aiCastId]?.status === "regenerating") return;
    setError(null);
    setRegenById((m) => ({
      ...m,
      [aiCastId]: { jobId: "", status: "regenerating" },
    }));

    let jobId: string;
    try {
      const res = await fetch(
        `/api/stories/${storyId}/ai-cast/${aiCastId}/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            promptAddition !== undefined ? { promptAddition } : {}
          ),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as { jobId: string };
      jobId = body.jobId;
      setRegenById((m) => ({
        ...m,
        [aiCastId]: { jobId, status: "regenerating" },
      }));
      // Reflect the new promptAddition locally so a follow-up
      // regenerate (with no override) replays the same prompt.
      if (promptAddition !== undefined) {
        setAiPortraits((prev) =>
          prev.map((p) =>
            p.aiCastId === aiCastId
              ? { ...p, promptAddition: promptAddition || null }
              : p
          )
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "regen failed";
      setRegenById((m) => ({
        ...m,
        [aiCastId]: { jobId: "", status: "failed", error: msg },
      }));
      return;
    }
    void pollUntilDone(jobId, ({ newUrl, error: err }) => {
      if (err) {
        setRegenById((m) => ({
          ...m,
          [aiCastId]: { jobId, status: "failed", error: err },
        }));
        return;
      }
      if (newUrl) {
        setAiPortraits((prev) =>
          prev.map((p) =>
            p.aiCastId === aiCastId ? { ...p, portraitUrl: newUrl } : p
          )
        );
      }
      setRegenById((m) => {
        const next = { ...m };
        delete next[aiCastId];
        return next;
      });
    });
  }

  // -------------------- AI-CAST rename (no regen) ------------------------

  async function commitRename(aiCastId: string) {
    const trimmed = nameDraft.trim();
    if (trimmed.length === 0) {
      // Empty value → cancel the edit, keep original name.
      setRenamingId(null);
      setNameDraft("");
      return;
    }
    const original = aiPortraits.find((p) => p.aiCastId === aiCastId);
    if (original && trimmed === original.name) {
      setRenamingId(null);
      setNameDraft("");
      return;
    }
    try {
      const res = await fetch(
        `/api/stories/${storyId}/ai-cast/${aiCastId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as { name: string };
      setAiPortraits((prev) =>
        prev.map((p) =>
          p.aiCastId === aiCastId ? { ...p, name: body.name } : p
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "rename failed";
      setError(msg);
    } finally {
      setRenamingId(null);
      setNameDraft("");
    }
  }

  // -------------------- BACKGROUND regenerate ----------------------------

  async function regenerateBackground(
    bgId: string,
    promptAddition?: string
  ) {
    if (regenById[bgId]?.status === "regenerating") return;
    setError(null);
    setRegenById((m) => ({
      ...m,
      [bgId]: { jobId: "", status: "regenerating" },
    }));

    let jobId: string;
    try {
      const res = await fetch(
        `/api/stories/${storyId}/backgrounds/${bgId}/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            promptAddition !== undefined ? { promptAddition } : {}
          ),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as { jobId: string };
      jobId = body.jobId;
      setRegenById((m) => ({
        ...m,
        [bgId]: { jobId, status: "regenerating" },
      }));
      if (promptAddition !== undefined) {
        setBackgrounds((prev) =>
          prev.map((b) =>
            b.bgId === bgId
              ? { ...b, promptAddition: promptAddition || null }
              : b
          )
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "regen failed";
      setRegenById((m) => ({
        ...m,
        [bgId]: { jobId: "", status: "failed", error: msg },
      }));
      return;
    }
    void pollUntilDone(jobId, ({ newUrl, error: err }) => {
      if (err) {
        setRegenById((m) => ({
          ...m,
          [bgId]: { jobId, status: "failed", error: err },
        }));
        return;
      }
      if (newUrl) {
        setBackgrounds((prev) =>
          prev.map((b) =>
            b.bgId === bgId ? { ...b, portraitUrl: newUrl } : b
          )
        );
      }
      setRegenById((m) => {
        const next = { ...m };
        delete next[bgId];
        return next;
      });
    });
  }

  // -------------------- BACKGROUND rename --------------------------------

  async function commitBgRename(bgId: string) {
    const trimmed = bgLabelDraft.trim();
    if (trimmed.length === 0) {
      setRenamingBgId(null);
      setBgLabelDraft("");
      return;
    }
    const original = backgrounds.find((b) => b.bgId === bgId);
    if (original && trimmed === original.label) {
      setRenamingBgId(null);
      setBgLabelDraft("");
      return;
    }
    try {
      const res = await fetch(
        `/api/stories/${storyId}/backgrounds/${bgId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: trimmed }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as { label: string };
      setBackgrounds((prev) =>
        prev.map((b) => (b.bgId === bgId ? { ...b, label: body.label } : b))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "rename failed");
    } finally {
      setRenamingBgId(null);
      setBgLabelDraft("");
    }
  }

  // -------------------- BACKGROUND remove (Stage 1 re-run) ---------------

  async function confirmBgRemove() {
    if (!pendingBgRemove) return;
    const removingId = pendingBgRemove.bgId;
    setRerunning(true);
    setError(null);
    setPendingBgRemove(null);
    let jobId: string;
    try {
      const res = await fetch(
        `/api/stories/${storyId}/backgrounds/${removingId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as { jobId: string };
      jobId = body.jobId;
    } catch (err) {
      setError(err instanceof Error ? err.message : "remove failed");
      setRerunning(false);
      return;
    }
    void pollUntilDone(jobId, ({ error: err }) => {
      if (err) {
        setError(err);
        setRerunning(false);
        return;
      }
      router.refresh();
      setRerunning(false);
    });
  }

  // -------------------- AI-CAST remove (Stage 1 re-run) ------------------

  async function confirmRemove() {
    if (!pendingRemove) return;
    const removingId = pendingRemove.aiCastId;
    setRerunning(true);
    setError(null);
    setPendingRemove(null);
    let jobId: string;
    try {
      const res = await fetch(
        `/api/stories/${storyId}/ai-cast/${removingId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as { jobId: string };
      jobId = body.jobId;
    } catch (err) {
      setError(err instanceof Error ? err.message : "remove failed");
      setRerunning(false);
      return;
    }
    void pollUntilDone(jobId, ({ error: err }) => {
      if (err) {
        setError(err);
        setRerunning(false);
        return;
      }
      // Reload the approve-cast page to read the new AI cast roster.
      router.refresh();
      setRerunning(false);
    });
  }

  // -------------------- approve all --------------------------------------

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
      {/* User-cast grid */}
      {portraits.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {portraits.map((p) => {
            const regen = regenById[p.characterId];
            const isRegenerating = regen?.status === "regenerating";
            return (
              <div
                key={p.characterId}
                className="overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-[0_1px_2px_rgba(14,26,43,0.04)] transition-all hover:border-gold-500"
              >
                <div className="relative aspect-square bg-cream-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.portraitUrl}
                    alt={p.name}
                    className="w-full h-full object-cover"
                  />
                  {isRegenerating && <RegenOverlay />}
                </div>
                <div className="flex items-center justify-between p-3">
                  <span className="font-medium text-ink-900">{p.name}</span>
                  <button
                    type="button"
                    onClick={() => regenerateUser(p.characterId)}
                    disabled={isRegenerating}
                    className="text-sm font-medium text-moss-700 underline-offset-2 transition-colors hover:text-moss-900 hover:underline disabled:opacity-50"
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
      )}

      {/* AI-cast grid */}
      {aiPortraits.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-[11px] uppercase tracking-[0.18em] text-ink-300">
            AI-imagined supporting cast
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {aiPortraits.map((p) => {
              const regen = regenById[p.aiCastId];
              const isRegenerating = regen?.status === "regenerating";
              const isEditingPrompt = editingPromptFor === p.aiCastId;
              const isRenaming = renamingId === p.aiCastId;
              return (
                <div
                  key={p.aiCastId}
                  className="overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-[0_1px_2px_rgba(14,26,43,0.04)] transition-all hover:border-gold-500"
                >
                  <div className="relative aspect-square bg-cream-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.portraitUrl}
                      alt={p.name}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-ink-900/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cream-50 backdrop-blur-sm">
                      AI-imagined
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPromptFor(p.aiCastId);
                        setPromptDraft(p.promptAddition ?? "");
                      }}
                      aria-label={`Edit ${p.name} with a prompt`}
                      title="Edit with prompt"
                      className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-cream-50/95 text-ink-700 shadow-sm transition-colors hover:bg-moss-700 hover:text-cream-50 focus:outline-none focus:ring-2 focus:ring-moss-500"
                    >
                      <PencilIcon />
                    </button>
                    {isRegenerating && <RegenOverlay />}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      {isRenaming ? (
                        <input
                          type="text"
                          value={nameDraft}
                          autoFocus
                          maxLength={120}
                          onChange={(e) => setNameDraft(e.target.value)}
                          onBlur={() => commitRename(p.aiCastId)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              (e.currentTarget as HTMLInputElement).blur();
                            } else if (e.key === "Escape") {
                              setRenamingId(null);
                              setNameDraft("");
                            }
                          }}
                          className="flex-1 min-w-0 rounded-md border border-moss-500 bg-cream-50 px-2 py-1 text-sm font-medium text-ink-900 focus:outline-none focus:ring-2 focus:ring-moss-500"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(p.aiCastId);
                            setNameDraft(p.name);
                          }}
                          title="Click to rename"
                          className="flex-1 min-w-0 truncate text-left font-medium text-ink-900 hover:text-moss-700"
                        >
                          {p.name}
                        </button>
                      )}
                    </div>
                    {p.roleLabel && (
                      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-ink-300">
                        {p.roleLabel}
                      </div>
                    )}
                    {!isEditingPrompt && (
                      <div className="mt-2 flex items-center gap-3 text-sm">
                        <button
                          type="button"
                          onClick={() => regenerateAi(p.aiCastId)}
                          disabled={isRegenerating}
                          className="font-medium text-moss-700 underline-offset-2 transition-colors hover:text-moss-900 hover:underline disabled:opacity-50"
                        >
                          {isRegenerating ? "Working…" : "Regenerate"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingRemove(p)}
                          disabled={isRegenerating || rerunning}
                          className="font-medium text-rose-600 underline-offset-2 transition-colors hover:text-rose-700 hover:underline disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  {isEditingPrompt && (
                    <div className="border-t border-cream-300 bg-cream-100 px-3 py-3">
                      <label className="block text-[11px] font-medium uppercase tracking-wide text-ink-500 mb-1">
                        Describe how {p.name} should look
                      </label>
                      <textarea
                        rows={3}
                        value={promptDraft}
                        onChange={(e) => setPromptDraft(e.target.value)}
                        placeholder="e.g. older, with grey hair and a blue jacket"
                        className="w-full rounded-md border border-cream-300 bg-cream-50 px-2 py-1.5 text-sm text-ink-900 placeholder:text-ink-300 focus:border-moss-500 focus:outline-none focus:ring-2 focus:ring-moss-700/20"
                      />
                      <div className="mt-2 flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPromptFor(null);
                            setPromptDraft("");
                          }}
                          className="text-xs font-medium text-ink-500 hover:text-ink-900"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            regenerateAi(p.aiCastId, promptDraft);
                            setEditingPromptFor(null);
                            setPromptDraft("");
                          }}
                          disabled={isRegenerating}
                          className="inline-flex items-center gap-1.5 rounded-full bg-moss-700 px-3 py-1.5 text-xs font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Regenerate with this
                        </button>
                      </div>
                    </div>
                  )}
                  {regen?.status === "failed" && (
                    <div className="px-3 pb-2 text-xs text-rose-600">
                      {regen.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Backgrounds (Spec B) */}
      {backgrounds.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-[11px] uppercase tracking-[0.18em] text-ink-300">
            Settings
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {backgrounds.map((b) => {
              const regen = regenById[b.bgId];
              const isRegenerating = regen?.status === "regenerating";
              const isEditingPrompt = editingBgPromptFor === b.bgId;
              const isRenaming = renamingBgId === b.bgId;
              return (
                <div
                  key={b.bgId}
                  className="overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-[0_1px_2px_rgba(14,26,43,0.04)] transition-all hover:border-gold-500"
                >
                  <div className="relative aspect-video bg-cream-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={b.portraitUrl}
                      alt={b.label}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBgPromptFor(b.bgId);
                        setBgPromptDraft(b.promptAddition ?? "");
                      }}
                      aria-label={`Edit ${b.label} with a prompt`}
                      title="Edit with prompt"
                      className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-cream-50/95 text-ink-700 shadow-sm transition-colors hover:bg-moss-700 hover:text-cream-50 focus:outline-none focus:ring-2 focus:ring-moss-500"
                    >
                      <PencilIcon />
                    </button>
                    {isRegenerating && <RegenOverlay />}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      {isRenaming ? (
                        <input
                          type="text"
                          value={bgLabelDraft}
                          autoFocus
                          maxLength={120}
                          onChange={(e) => setBgLabelDraft(e.target.value)}
                          onBlur={() => commitBgRename(b.bgId)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              (e.currentTarget as HTMLInputElement).blur();
                            } else if (e.key === "Escape") {
                              setRenamingBgId(null);
                              setBgLabelDraft("");
                            }
                          }}
                          className="flex-1 min-w-0 rounded-md border border-moss-500 bg-cream-50 px-2 py-1 text-sm font-medium text-ink-900 focus:outline-none focus:ring-2 focus:ring-moss-500"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingBgId(b.bgId);
                            setBgLabelDraft(b.label);
                          }}
                          title="Click to rename"
                          className="flex-1 min-w-0 truncate text-left font-medium text-ink-900 hover:text-moss-700"
                        >
                          {b.label}
                        </button>
                      )}
                    </div>
                    {!isEditingPrompt && (
                      <div className="mt-2 flex items-center gap-3 text-sm">
                        <button
                          type="button"
                          onClick={() => {
                            // Same UX as Spec A post-PR-#66: open
                            // the prompt editor first; user
                            // confirms via "Regenerate with this"
                            // inside the box.
                            setEditingBgPromptFor(b.bgId);
                            setBgPromptDraft(b.promptAddition ?? "");
                          }}
                          disabled={isRegenerating}
                          className="font-medium text-moss-700 underline-offset-2 transition-colors hover:text-moss-900 hover:underline disabled:opacity-50"
                        >
                          {isRegenerating ? "Working…" : "Regenerate"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingBgRemove(b)}
                          disabled={isRegenerating || rerunning}
                          className="font-medium text-rose-600 underline-offset-2 transition-colors hover:text-rose-700 hover:underline disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  {isEditingPrompt && (
                    <div className="border-t border-cream-300 bg-cream-100 px-3 py-3">
                      <label className="block text-[11px] font-medium uppercase tracking-wide text-ink-500 mb-1">
                        Describe how {b.label} should look
                      </label>
                      <textarea
                        rows={3}
                        value={bgPromptDraft}
                        onChange={(e) => setBgPromptDraft(e.target.value)}
                        placeholder="e.g. darker, with more trees and a stone wall"
                        className="w-full rounded-md border border-cream-300 bg-cream-50 px-2 py-1.5 text-sm text-ink-900 placeholder:text-ink-300 focus:border-moss-500 focus:outline-none focus:ring-2 focus:ring-moss-700/20"
                      />
                      <div className="mt-2 flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBgPromptFor(null);
                            setBgPromptDraft("");
                          }}
                          className="text-xs font-medium text-ink-500 hover:text-ink-900"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            regenerateBackground(b.bgId, bgPromptDraft);
                            setEditingBgPromptFor(null);
                            setBgPromptDraft("");
                          }}
                          disabled={isRegenerating}
                          className="inline-flex items-center gap-1.5 rounded-full bg-moss-700 px-3 py-1.5 text-xs font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Regenerate with this
                        </button>
                      </div>
                    </div>
                  )}
                  {regen?.status === "failed" && (
                    <div className="px-3 pb-2 text-xs text-rose-600">
                      {regen.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-3 text-sm font-medium text-rose-600">{error}</div>
      )}

      <button
        type="button"
        onClick={approveAll}
        disabled={approving || anyRegenerating || rerunning}
        className="inline-flex items-center gap-1.5 rounded-full bg-moss-700 px-6 py-3 text-base font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        title={
          anyRegenerating
            ? "Wait for portraits to finish regenerating"
            : rerunning
              ? "Rewriting the story…"
              : undefined
        }
      >
        {approving ? "Sending…" : "Approve all & generate pages"}
      </button>

      {/* Remove-confirmation modal */}
      {pendingRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl bg-cream-50 p-6 shadow-2xl">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
              Remove {pendingRemove.name}?
            </h2>
            <p className="mt-2 text-sm text-ink-700">
              Removing {pendingRemove.name} will rewrite the story without
              them. This takes about 15 seconds and may change other pages.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingRemove(null)}
                className="inline-flex items-center gap-1.5 rounded-full border border-cream-300 bg-cream-50 px-5 py-2.5 text-sm font-semibold text-ink-700 shadow-sm transition-colors hover:bg-cream-100 hover:border-cream-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemove}
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-5 py-2.5 text-sm font-semibold text-rose-600 shadow-sm transition-colors hover:bg-rose-100 hover:border-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2"
              >
                Remove and rewrite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spec B: background remove-confirmation modal */}
      {pendingBgRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl bg-cream-50 p-6 shadow-2xl">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
              Remove {pendingBgRemove.label}?
            </h2>
            <p className="mt-2 text-sm text-ink-700">
              Removing {pendingBgRemove.label} will rewrite the story without
              this setting. Pages set there will move to another location or
              be rewritten. This takes about 15 seconds.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingBgRemove(null)}
                className="inline-flex items-center gap-1.5 rounded-full border border-cream-300 bg-cream-50 px-5 py-2.5 text-sm font-semibold text-ink-700 shadow-sm transition-colors hover:bg-cream-100 hover:border-cream-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBgRemove}
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-5 py-2.5 text-sm font-semibold text-rose-600 shadow-sm transition-colors hover:bg-rose-100 hover:border-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2"
              >
                Remove and rewrite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-page overlay while the Stage-1 re-run is in flight */}
      {rerunning && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-cream-50/90 backdrop-blur-sm">
          <Spinner />
          <span className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink-900">
            Rewriting your story…
          </span>
          <span className="text-sm text-ink-500">
            This takes about 15 seconds.
          </span>
        </div>
      )}
    </div>
  );
}

function RegenOverlay() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-cream-50/80 backdrop-blur-sm">
      <Spinner />
      <span className="text-xs font-medium text-ink-700">Regenerating…</span>
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

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}
