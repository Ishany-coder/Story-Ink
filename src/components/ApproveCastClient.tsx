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

  // User-cast Regenerate prompt-editor state. Same shape as the
  // AI-cast editor but keyed by characterId. The user's prompt is
  // a one-shot tweak — not persisted on the character row. The
  // user's photo stays the canonical likeness; this prompt only
  // adjusts wardrobe / pose / mood for the next regeneration.
  const [editingUserPromptFor, setEditingUserPromptFor] = useState<
    string | null
  >(null);
  const [userPromptDraft, setUserPromptDraft] = useState("");

  // AI-cast inline-rename state. Holds the aiCastId being edited and
  // the in-progress name value.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");

  // Spec B: parallel state for background editing. Kept separate
  // from AI-cast state so the two sections never share a pencil-
  // editor or rename target.
  const [editingBgPromptFor, setEditingBgPromptFor] = useState<string | null>(
    null
  );
  const [bgPromptDraft, setBgPromptDraft] = useState("");
  const [renamingBgId, setRenamingBgId] = useState<string | null>(null);
  const [bgLabelDraft, setBgLabelDraft] = useState("");

  // Add-main-cast modal. Lazy-loads the user's library on open;
  // filters out characters already in the story.
  const [addMainOpen, setAddMainOpen] = useState(false);
  const [library, setLibrary] = useState<
    Array<{
      id: string;
      name: string;
      kind: "person" | "pet";
      reference_photo_urls: string[];
    }>
  >([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  // Add-supporting (AI) modal. Inline form.
  const [addSupportingOpen, setAddSupportingOpen] = useState(false);
  const [supName, setSupName] = useState("");
  const [supRole, setSupRole] = useState("");
  const [supKind, setSupKind] = useState<"person" | "pet">("person");
  const [supDescription, setSupDescription] = useState("");
  const [supSubmitting, setSupSubmitting] = useState(false);
  const [supError, setSupError] = useState<string | null>(null);

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

  // -------------------- USER-CAST regenerate (with optional prompt) -----

  async function regenerateUser(
    characterId: string,
    promptAddition?: string
  ) {
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

  // -------------------- BACKGROUND remove (instant, no rewrite) ----------
  //
  // Removal is synchronous + UI-only. The DELETE endpoint hard-deletes
  // the row but does NOT trigger a script rewrite — that's deferred
  // to approve time (generatePagesAfterApprovalFn detects missing
  // rows vs script references and runs the rewrite inline before
  // pages). This lets the user remove multiple items quickly
  // without waiting on a per-removal Gemini rewrite.

  async function removeBackground(bg: Background) {
    setError(null);
    // Optimistically drop from local state; restore on failure.
    setBackgrounds((prev) => prev.filter((b) => b.bgId !== bg.bgId));
    try {
      const res = await fetch(
        `/api/stories/${storyId}/backgrounds/${bg.bgId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      setError(err instanceof Error ? err.message : "remove failed");
      // Restore — put the card back where it was.
      setBackgrounds((prev) => [...prev, bg]);
    }
  }

  // -------------------- AI-CAST remove (instant, no rewrite) -------------

  async function removeAiCast(member: AiPortrait) {
    setError(null);
    setAiPortraits((prev) =>
      prev.filter((p) => p.aiCastId !== member.aiCastId)
    );
    try {
      const res = await fetch(
        `/api/stories/${storyId}/ai-cast/${member.aiCastId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      setError(err instanceof Error ? err.message : "remove failed");
      setAiPortraits((prev) => [...prev, member]);
    }
  }

  // -------------------- USER-CAST remove (instant) -----------------------
  //
  // Removes the UUID from stories.cast_character_ids. The character
  // row itself stays in the user's library. Same defer-rewrite
  // semantics as AI-cast / background remove: detect-exclusions at
  // approve time picks up the missing UUID and rewrites.

  async function removeUserCast(p: UserPortrait) {
    setError(null);
    setPortraits((prev) => prev.filter((x) => x.characterId !== p.characterId));
    try {
      const res = await fetch(
        `/api/stories/${storyId}/cast/${p.characterId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      setError(err instanceof Error ? err.message : "remove failed");
      setPortraits((prev) => [...prev, p]);
    }
  }

  // -------------------- ADD main cast (from library) ---------------------

  async function openAddMain() {
    setAddMainOpen(true);
    setLibraryError(null);
    if (library.length > 0) return; // already loaded
    setLibraryLoading(true);
    try {
      const res = await fetch("/api/characters", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as {
        characters: Array<{
          id: string;
          name: string;
          kind: "person" | "pet";
          reference_photo_urls: string[];
        }>;
      };
      setLibrary(body.characters ?? []);
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : "load failed");
    } finally {
      setLibraryLoading(false);
    }
  }

  async function addMainFromLibrary(charId: string) {
    setError(null);
    // Close the modal immediately for snappy feel.
    setAddMainOpen(false);
    try {
      const res = await fetch(`/api/stories/${storyId}/cast/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterIds: [charId] }),
      });
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as {
        added: Array<{
          characterId: string;
          name: string;
          jobId?: string;
          portraitUrl?: string;
        }>;
      };
      for (const entry of body.added) {
        if (entry.portraitUrl) {
          // Cache hit — render the card immediately.
          setPortraits((prev) => [
            ...prev,
            {
              characterId: entry.characterId,
              name: entry.name,
              portraitUrl: entry.portraitUrl!,
            },
          ]);
        } else if (entry.jobId) {
          // Cache miss — insert a placeholder card in "regenerating"
          // state and poll for the result.
          setPortraits((prev) => [
            ...prev,
            {
              characterId: entry.characterId,
              name: entry.name,
              // 1x1 transparent PNG so the <img> renders something
              // while the spinner overlay covers it.
              portraitUrl:
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
            },
          ]);
          setRegenById((m) => ({
            ...m,
            [entry.characterId]: {
              jobId: entry.jobId!,
              status: "regenerating",
            },
          }));
          const cid = entry.characterId;
          const jid = entry.jobId;
          void pollUntilDone(jid, ({ newUrl, error: err }) => {
            if (err) {
              setRegenById((m) => ({
                ...m,
                [cid]: { jobId: jid, status: "failed", error: err },
              }));
              return;
            }
            if (newUrl) {
              setPortraits((prev) =>
                prev.map((p) =>
                  p.characterId === cid ? { ...p, portraitUrl: newUrl } : p
                )
              );
            }
            setRegenById((m) => {
              const next = { ...m };
              delete next[cid];
              return next;
            });
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "add failed");
    }
  }

  // -------------------- ADD supporting cast (AI-generate) ----------------

  function closeAddSupporting() {
    setAddSupportingOpen(false);
    setSupName("");
    setSupRole("");
    setSupKind("person");
    setSupDescription("");
    setSupError(null);
  }

  async function submitAddSupporting() {
    setSupError(null);
    if (supName.trim().length === 0) {
      setSupError("Name is required");
      return;
    }
    if (supDescription.trim().length === 0) {
      setSupError("Description is required");
      return;
    }
    setSupSubmitting(true);
    try {
      const res = await fetch(`/api/stories/${storyId}/ai-cast/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: supName.trim(),
          roleLabel: supRole.trim() || undefined,
          kind: supKind,
          description: supDescription.trim(),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as {
        aiCastId: string;
        jobId: string;
        name: string;
        roleLabel: string | null;
        kind: "person" | "pet";
      };
      // Add a placeholder card + poll the regen job.
      const placeholder: AiPortrait = {
        aiCastId: body.aiCastId,
        name: body.name,
        roleLabel: body.roleLabel,
        kind: body.kind,
        portraitUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        promptAddition: null,
      };
      setAiPortraits((prev) => [...prev, placeholder]);
      setRegenById((m) => ({
        ...m,
        [body.aiCastId]: { jobId: body.jobId, status: "regenerating" },
      }));
      const aiId = body.aiCastId;
      const jid = body.jobId;
      void pollUntilDone(jid, ({ newUrl, error: err }) => {
        if (err) {
          setRegenById((m) => ({
            ...m,
            [aiId]: { jobId: jid, status: "failed", error: err },
          }));
          return;
        }
        if (newUrl) {
          setAiPortraits((prev) =>
            prev.map((p) =>
              p.aiCastId === aiId ? { ...p, portraitUrl: newUrl } : p
            )
          );
        }
        setRegenById((m) => {
          const next = { ...m };
          delete next[aiId];
          return next;
        });
      });
      closeAddSupporting();
    } catch (err) {
      setSupError(err instanceof Error ? err.message : "add failed");
    } finally {
      setSupSubmitting(false);
    }
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
      {/* User-cast (main cast) — always render header + Add button.
          Grid is empty when no main cast (user can still add). */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink-300">
            Your cast
          </h2>
          <button
            type="button"
            onClick={openAddMain}
            className="inline-flex items-center gap-1 text-sm font-medium text-moss-700 underline-offset-2 transition-colors hover:text-moss-900 hover:underline"
          >
            + Add main cast
          </button>
        </div>
        {portraits.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 px-4 py-6 text-center text-sm text-ink-500">
            No main cast yet. Add a character from your library — they&rsquo;ll
            appear on the storybook pages with their real likeness.
          </div>
        ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {portraits.map((p) => {
            const regen = regenById[p.characterId];
            const isRegenerating = regen?.status === "regenerating";
            const isEditingPrompt = editingUserPromptFor === p.characterId;
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
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink-900 truncate">{p.name}</span>
                  </div>
                  {!isEditingPrompt && (
                    <div className="mt-2 flex items-center gap-3 text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          // Mirrors the AI-cast pattern (post-PR-#66):
                          // Regenerate opens a prompt editor first so
                          // the user never accidentally re-rolls
                          // without a chance to tweak.
                          setEditingUserPromptFor(p.characterId);
                          setUserPromptDraft("");
                        }}
                        disabled={isRegenerating}
                        className="font-medium text-moss-700 underline-offset-2 transition-colors hover:text-moss-900 hover:underline disabled:opacity-50"
                      >
                        {isRegenerating ? "Working…" : "Regenerate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeUserCast(p)}
                        disabled={isRegenerating}
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
                      Tweak {p.name}&rsquo;s portrait{" "}
                      <span className="text-ink-300 font-normal normal-case">
                        (optional)
                      </span>
                    </label>
                    <textarea
                      rows={3}
                      value={userPromptDraft}
                      onChange={(e) => setUserPromptDraft(e.target.value)}
                      placeholder="e.g. wearing a blue jacket, happier expression"
                      className="w-full rounded-md border border-cream-300 bg-cream-50 px-2 py-1.5 text-sm text-ink-900 placeholder:text-ink-300 focus:border-moss-500 focus:outline-none focus:ring-2 focus:ring-moss-700/20"
                    />
                    <p className="mt-1 text-[11px] text-ink-300">
                      Their facial features stay anchored to your photo.
                    </p>
                    <div className="mt-2 flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUserPromptFor(null);
                          setUserPromptDraft("");
                        }}
                        className="text-xs font-medium text-ink-500 hover:text-ink-900"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          regenerateUser(p.characterId, userPromptDraft);
                          setEditingUserPromptFor(null);
                          setUserPromptDraft("");
                        }}
                        disabled={isRegenerating}
                        className="inline-flex items-center gap-1.5 rounded-full bg-moss-700 px-3 py-1.5 text-xs font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Regenerate
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
        )}
      </div>

      {/* AI-cast (supporting) — always render header + Add button. */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink-300">
            AI-imagined supporting cast
          </h2>
          <button
            type="button"
            onClick={() => setAddSupportingOpen(true)}
            className="inline-flex items-center gap-1 text-sm font-medium text-moss-700 underline-offset-2 transition-colors hover:text-moss-900 hover:underline"
          >
            + Add supporting cast
          </button>
        </div>
        {aiPortraits.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 px-4 py-6 text-center text-sm text-ink-500">
            No supporting cast yet. Add one and the AI invents the likeness
            from your description.
          </div>
        ) : (
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
                          onClick={() => {
                            // Regenerate always opens the prompt
                            // editor first — same affordance as the
                            // pencil icon. The user confirms the
                            // (possibly unchanged) prompt by clicking
                            // "Regenerate with this" inside the box,
                            // so a fast-path "regen without thinking"
                            // can't ship a portrait the user didn't
                            // explicitly approve.
                            setEditingPromptFor(p.aiCastId);
                            setPromptDraft(p.promptAddition ?? "");
                          }}
                          disabled={isRegenerating}
                          className="font-medium text-moss-700 underline-offset-2 transition-colors hover:text-moss-900 hover:underline disabled:opacity-50"
                        >
                          {isRegenerating ? "Working…" : "Regenerate"}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeAiCast(p)}
                          disabled={isRegenerating}
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
        )}
      </div>

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
                          onClick={() => removeBackground(b)}
                          disabled={isRegenerating}
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
        disabled={approving || anyRegenerating}
        className="inline-flex items-center gap-1.5 rounded-full bg-moss-700 px-6 py-3 text-base font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        title={
          anyRegenerating
            ? "Wait for portraits to finish regenerating"
            : undefined
        }
      >
        {approving ? "Sending…" : "Approve all & generate pages"}
      </button>

      {/* Add-main-cast modal — picks from the user's library. */}
      {addMainOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm px-4"
          onClick={() => setAddMainOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-cream-50 p-6 shadow-2xl max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
                Add main cast
              </h2>
              <button
                type="button"
                onClick={() => setAddMainOpen(false)}
                aria-label="Close"
                className="text-ink-500 hover:text-ink-900 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <p className="text-sm text-ink-500 mb-4">
              Pick a character from your library. Their real photo
              becomes the likeness anchor on every page they appear in.
            </p>
            {libraryLoading && (
              <div className="py-8 text-center text-sm text-ink-500">
                Loading…
              </div>
            )}
            {libraryError && (
              <div className="py-2 text-sm text-rose-600">{libraryError}</div>
            )}
            {!libraryLoading &&
              !libraryError &&
              (() => {
                const usedIds = new Set(portraits.map((p) => p.characterId));
                const available = library.filter((c) => !usedIds.has(c.id));
                if (available.length === 0) {
                  return (
                    <div className="py-4 text-sm text-ink-500">
                      All your library characters are already in this story.{" "}
                      <a
                        href={`/characters/new?next=${encodeURIComponent(
                          `/stories/${storyId}/approve-cast`
                        )}`}
                        className="font-medium text-moss-700 underline hover:text-moss-900"
                      >
                        Create a new character
                      </a>
                      .
                    </div>
                  );
                }
                return (
                  <div className="grid grid-cols-2 gap-3 overflow-y-auto">
                    {available.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => addMainFromLibrary(c.id)}
                        className="overflow-hidden rounded-xl border border-cream-300 bg-cream-50 text-left transition-all hover:border-gold-500 hover:shadow-[0_4px_12px_rgba(14,26,43,0.06)]"
                      >
                        <div className="aspect-square bg-cream-200">
                          {c.reference_photo_urls[0] && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.reference_photo_urls[0]}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <div className="p-2">
                          <div className="text-sm font-medium text-ink-900 truncate">
                            {c.name}
                          </div>
                          <div className="text-[10px] uppercase tracking-wide text-ink-300">
                            {c.kind}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })()}
            <div className="mt-4 border-t border-cream-300 pt-3">
              <a
                href={`/characters/new?next=${encodeURIComponent(
                  `/stories/${storyId}/approve-cast`
                )}`}
                className="text-sm font-medium text-moss-700 underline hover:text-moss-900"
              >
                + Create a new character (with photo)
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Add-supporting-cast modal — AI-generate form. */}
      {addSupportingOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm px-4"
          onClick={closeAddSupporting}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-cream-50 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
                Add supporting character
              </h2>
              <button
                type="button"
                onClick={closeAddSupporting}
                aria-label="Close"
                className="text-ink-500 hover:text-ink-900 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <p className="text-sm text-ink-500 mb-4">
              The AI will invent this character&rsquo;s likeness from your
              description and use them consistently across pages.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  maxLength={120}
                  placeholder="e.g. Sarah, Mr. Patel, the priest"
                  className="w-full rounded-md border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:border-moss-500 focus:outline-none focus:ring-2 focus:ring-moss-700/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">
                  Role <span className="text-ink-300 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={supRole}
                  onChange={(e) => setSupRole(e.target.value)}
                  maxLength={120}
                  placeholder="e.g. best friend, the antagonist"
                  className="w-full rounded-md border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:border-moss-500 focus:outline-none focus:ring-2 focus:ring-moss-700/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">
                  Kind
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSupKind("person")}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                      supKind === "person"
                        ? "border-moss-500 bg-moss-100/40 text-moss-900"
                        : "border-cream-300 bg-cream-50 text-ink-700 hover:border-gold-500"
                    }`}
                  >
                    Person
                  </button>
                  <button
                    type="button"
                    onClick={() => setSupKind("pet")}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                      supKind === "pet"
                        ? "border-moss-500 bg-moss-100/40 text-moss-900"
                        : "border-cream-300 bg-cream-50 text-ink-700 hover:border-gold-500"
                    }`}
                  >
                    Pet
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={supDescription}
                  onChange={(e) => setSupDescription(e.target.value)}
                  placeholder="e.g. a tall older man with greying hair, wire-rimmed glasses, warm smile"
                  className="w-full rounded-md border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:border-moss-500 focus:outline-none focus:ring-2 focus:ring-moss-700/20"
                />
                <p className="mt-1 text-[11px] text-ink-300">
                  Focus on stable physical features (age, build, hair,
                  distinguishing marks) — what should stay consistent on
                  every page.
                </p>
              </div>
              {supError && (
                <div className="text-sm text-rose-600">{supError}</div>
              )}
            </div>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeAddSupporting}
                disabled={supSubmitting}
                className="text-sm font-medium text-ink-500 hover:text-ink-900 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitAddSupporting}
                disabled={supSubmitting}
                className="inline-flex items-center gap-1.5 rounded-full bg-moss-700 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {supSubmitting ? "Adding…" : "Add character"}
              </button>
            </div>
          </div>
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
