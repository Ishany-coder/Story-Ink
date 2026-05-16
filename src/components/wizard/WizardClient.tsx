"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import StepShell from "./StepShell";
import type {
  ArtStyle,
  Character,
  MemoryReference,
  Occasion,
  RecipientType,
  StoryDraft,
  WizardPayload,
} from "@/lib/types";

interface RecipientTile {
  id: RecipientType;
  label: string;
  // Relative URL into /public/recipient-samples/<id>.webp.
  imageUrl?: string;
}

// Primary tiles render as illustrated cards in a 3-column grid.
const PRIMARY_RECIPIENTS: RecipientTile[] = [
  { id: "child", label: "My Child", imageUrl: "/recipient-samples/child.webp" },
  { id: "baby", label: "My Baby", imageUrl: "/recipient-samples/baby.webp" },
  { id: "partner", label: "Partner / Spouse", imageUrl: "/recipient-samples/partner.webp" },
  { id: "parent", label: "Mom / Dad", imageUrl: "/recipient-samples/parent.webp" },
  { id: "niece_nephew", label: "Niece / Nephew", imageUrl: "/recipient-samples/niece_nephew.webp" },
  { id: "sibling", label: "My Sibling", imageUrl: "/recipient-samples/sibling.webp" },
  { id: "friend", label: "My Friend", imageUrl: "/recipient-samples/friend.webp" },
  { id: "grandparent", label: "Grandma / Grandpa", imageUrl: "/recipient-samples/grandparent.webp" },
  { id: "pet", label: "My Pet", imageUrl: "/recipient-samples/pet.webp" },
];

// Secondary tiles render as compact pills under "More options…".
const MORE_RECIPIENTS: RecipientTile[] = [
  { id: "aunt", label: "Aunt" },
  { id: "uncle", label: "Uncle" },
  { id: "cousin", label: "Cousin" },
  { id: "family", label: "Family" },
  { id: "self", label: "Myself" },
];

interface OccasionMeta {
  id: Occasion;
  label: string;
}

const OCCASIONS: OccasionMeta[] = [
  { id: "birthday", label: "Birthday" },
  { id: "anniversary", label: "Anniversary" },
  { id: "memorial", label: "Memorial" },
  { id: "just_because", label: "Just because" },
  { id: "graduation", label: "Graduation" },
  { id: "holiday", label: "Holiday" },
  { id: "new_baby", label: "New baby" },
  { id: "achievement", label: "Achievement" },
];

const OCCASION_LABELS: Record<Occasion, string> = OCCASIONS.reduce(
  (acc, o) => {
    acc[o.id] = o.label;
    return acc;
  },
  {} as Record<Occasion, string>
);

const RECIPIENT_LABELS: Record<RecipientType, string> = {
  ...Object.fromEntries(
    [...PRIMARY_RECIPIENTS, ...MORE_RECIPIENTS].map((r) => [r.id, r.label])
  ),
  // Fallback for the "other" sentinel used by the Custom storybook flow.
  other: "Custom storybook",
} as Record<RecipientType, string>;

const PAGE_PRESETS = [8, 16, 24, 32, 48];

export default function WizardClient({
  draft,
  initialCharacters,
  artStyles,
}: {
  draft: StoryDraft;
  initialCharacters: Character[];
  artStyles: ArtStyle[];
}) {
  const router = useRouter();
  const [characters, setCharacters] = useState<Character[]>(initialCharacters);
  const [step, setStep] = useState<number>(draft.current_step);
  const [payload, setPayload] = useState<WizardPayload>(draft.payload ?? {});
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Step 3 in-place delete: holds the character pending confirmation
  // (null = modal closed) plus a flag to debounce against double-fire
  // while the DELETE request is in flight.
  const [pendingDelete, setPendingDelete] = useState<Character | null>(null);
  const [deletingCharacter, setDeletingCharacter] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Scroll target for generate-stage errors on Step 7. The Generate
  // CTA lives in the top action row; without scrollIntoView the error
  // banner ended up below the fold and the failure looked silent.
  const errorAnchorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (error && errorAnchorRef.current) {
      errorAnchorRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [error]);
  // Step 1's "Custom storybook" inline panel toggle.
  const [customOpen, setCustomOpen] = useState<boolean>(
    () => (draft.payload?.recipientType === "other") && Boolean(draft.payload?.outline)
  );
  const [customDraft, setCustomDraft] = useState<string>(
    () =>
      draft.payload?.recipientType === "other"
        ? draft.payload?.outline ?? ""
        : ""
  );

  // One-shot reconciliation: drop cast ids that no longer exist among
  // the user's characters. `initialCharacters` is fresh from the
  // server, so it's the authority. Old drafts can carry ids that
  // pointed at characters since deleted from /characters; if we don't
  // strip them here, the user submits, hits a 400 at /api/generate/v2,
  // and bounces with no clear path forward. Auto-save picks up the
  // cleaned payload on its next debounce.
  useEffect(() => {
    const valid = new Set(initialCharacters.map((c) => c.id));
    const current = payload.castCharacterIds ?? [];
    const filtered = current.filter((id) => valid.has(id));
    if (filtered.length !== current.length) {
      setPayload((p) => ({ ...p, castCharacterIds: filtered }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-select a character that was just created via the "+ Add
  // character" tile. CharacterForm appends ?addedCharacter=<id> to
  // the wizard return URL on successful create; we read it here, add
  // the id to the cast (if it actually exists in initialCharacters),
  // then strip the param so a refresh doesn't re-trigger the effect.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const addedId = url.searchParams.get("addedCharacter");
    if (!addedId) return;
    const exists = initialCharacters.some((c) => c.id === addedId);
    if (exists) {
      setPayload((p) => {
        const current = p.castCharacterIds ?? [];
        if (current.includes(addedId)) return p;
        return { ...p, castCharacterIds: [...current, addedId] };
      });
    }
    url.searchParams.delete("addedCharacter");
    router.replace(url.pathname + (url.search ? url.search : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save on every step / payload change (debounced).
  const saveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      fetch(`/api/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_step: step, payload }),
      }).catch(() => {
        /* fire and forget */
      });
    }, 500);
    return () => {
      if (saveRef.current) clearTimeout(saveRef.current);
    };
  }, [step, payload, draft.id]);

  const totalSteps = 7;
  const set = (patch: Partial<WizardPayload>) =>
    setPayload((p) => ({ ...p, ...patch }));

  // When the user arrives at a step via a "click summary card" from step 7,
  // any forward navigation (Next, Skip) snaps back to step 7 instead of
  // marching through the wizard linearly. Back also returns to 7. Cleared
  // on review return.
  const [returnToReview, setReturnToReview] = useState(false);

  // Browser-back integration: each forward step push adds a history entry
  // tagged with { wizardStep }. The popstate listener mirrors browser
  // navigation back into React state so hitting the browser Back arrow
  // walks the user back through wizard steps instead of leaving the page.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Tag the initial entry so popstate from a later step can recognize
    // it as wizard state. replaceState avoids polluting history.
    const existing = window.history.state;
    if (!existing || typeof existing.wizardStep !== "number") {
      window.history.replaceState(
        { ...(existing ?? {}), wizardStep: step },
        ""
      );
    }
    const onPopState = (e: PopStateEvent) => {
      const s = e.state?.wizardStep;
      if (typeof s === "number" && s >= 1 && s <= totalSteps) {
        setStep(s);
        // Landing back on review via browser-back clears the edit
        // affordance — otherwise a subsequent Next would loop back to 7.
        if (s === 7) setReturnToReview(false);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // Intentionally mount-only — `step` updates flow through React state
    // separately; the listener reads from history events directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateForward = useCallback((target: number) => {
    if (typeof window !== "undefined") {
      window.history.pushState({ wizardStep: target }, "");
    }
    setStep(target);
  }, []);

  // For in-UI Back, prefer history.back() so the wizard's history stack
  // collapses naturally and a subsequent browser Back continues to the
  // step before. Falls back to setStep when there's no wizard entry to
  // pop (defensive — should not happen after the mount-effect tags state).
  const navigateBack = useCallback((fallback: number) => {
    if (
      typeof window !== "undefined" &&
      window.history.state?.wizardStep
    ) {
      window.history.back();
    } else {
      setStep(fallback);
    }
  }, []);

  const goNext = (target: number) => {
    if (returnToReview) {
      setReturnToReview(false);
      navigateForward(7);
    } else {
      navigateForward(target);
    }
  };

  const goBack = (target: number) => {
    if (returnToReview) {
      setReturnToReview(false);
      navigateForward(7);
    } else {
      navigateBack(target);
    }
  };

  const editFromReview = (originStep: number) => {
    setReturnToReview(true);
    navigateForward(originStep);
  };

  const selectRecipient = (id: RecipientType) => {
    // Picking a tile only updates selection; advancing is done via the
    // top-right Next button so the user can change their mind without
    // bouncing between steps. Clearing `outline` here keeps the custom
    // storybook state from leaking into a templated pick.
    set({ recipientType: id, outline: undefined });
    setCustomOpen(false);
  };

  async function confirmDeleteCharacter() {
    if (!pendingDelete) return;
    setDeletingCharacter(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/characters/${pendingDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      const deletedId = pendingDelete.id;
      // Drop from the local character list and from any selection
      // payload so the next render no longer shows the tile or counts
      // it toward the cast.
      setCharacters((prev) => prev.filter((c) => c.id !== deletedId));
      const currentCast = payload.castCharacterIds ?? [];
      if (currentCast.includes(deletedId)) {
        set({
          castCharacterIds: currentCast.filter((id) => id !== deletedId),
        });
      }
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "delete failed");
    } finally {
      setDeletingCharacter(false);
    }
  }

  // Refresh character list (used when user returns from /characters/new).
  useEffect(() => {
    if (step !== 3) return;
    fetch("/api/characters")
      .then((r) => r.json())
      .then((b: { characters: Character[] }) =>
        setCharacters(b.characters ?? [])
      )
      .catch(() => undefined);
  }, [step]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/generate/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientType: payload.recipientType,
          occasion: payload.occasion,
          // Story tone is no longer surfaced in the UI but the API still
          // requires it — default to "classic" so the contract holds.
          storyTone: payload.storyTone ?? "classic",
          castCharacterIds: payload.castCharacterIds ?? [],
          outline: payload.outline ?? "",
          memories: payload.memories ?? [],
          artStyleId: payload.artStyleId,
          pageCount: payload.pageCount ?? 16,
          title: payload.title,
          defaultTextSize: payload.defaultTextSize,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as { storyId: string };
      // Delete the draft now that it's been promoted to a story.
      fetch(`/api/drafts/${draft.id}`, { method: "DELETE" }).catch(
        () => undefined
      );
      router.push(`/stories/${body.storyId}/progress`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "generate failed");
      setGenerating(false);
    }
  }

  // ---- Per-step rendering ------------------------------------------------

  if (step === 1) {
    const moreSelected = MORE_RECIPIENTS.some(
      (r) => r.id === payload.recipientType
    );
    // Top-right Next is gated on having a selection. The "other" custom
    // path additionally requires a non-empty outline since the AI has
    // nothing to work with otherwise.
    const nextDisabled =
      !payload.recipientType ||
      (payload.recipientType === "other" && !customDraft.trim());
    return (
      <StepShell
        step={1}
        totalSteps={totalSteps}
        title="Who is this book for?"
        onNext={() => {
          if (payload.recipientType === "other") {
            // Commit the custom textarea text on advance.
            set({ outline: customDraft.trim() });
          }
          goNext(2);
        }}
        nextAtTop
        nextDisabled={nextDisabled}
        editingReview={returnToReview}
        onExitReview={() => {
          setReturnToReview(false);
          navigateBack(7);
        }}
      >
        <div className="grid grid-cols-3 sm:grid-cols-3 gap-2.5">
          {PRIMARY_RECIPIENTS.map((r) => {
            const selected = payload.recipientType === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => selectRecipient(r.id)}
                className={`text-left rounded-2xl border bg-cream-50 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-gold-500 hover:shadow-[0_8px_24px_rgba(14,26,43,0.08)] ${
                  selected
                    ? "border-moss-500 ring-2 ring-moss-700 bg-moss-100/40"
                    : "border-cream-300"
                }`}
              >
                <div className="aspect-[3/2] bg-cream-100">
                  {r.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.imageUrl}
                      alt={r.label}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="px-2 py-1.5 text-center text-sm font-medium text-ink-900">
                  {r.label}
                </div>
              </button>
            );
          })}
        </div>

        <details className="mt-4" open={moreSelected}>
          <summary className="cursor-pointer text-sm font-medium text-ink-700 mb-2 select-none">
            More options…
          </summary>
          <div className="flex flex-wrap gap-2 pt-1">
            {MORE_RECIPIENTS.map((r) => {
              const selected = payload.recipientType === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => selectRecipient(r.id)}
                  className={`px-4 py-1.5 rounded-full border text-sm transition ${
                    selected
                      ? "bg-moss-100/60 border-moss-500 text-moss-900 ring-2 ring-moss-700"
                      : "bg-cream-50 border-cream-300 text-ink-700 hover:border-gold-500"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </details>

        {/* Custom storybook — distinct from the templates above. Opens an
            inline textarea; advancing via the top-right Next stores the
            freeform prompt in payload.outline under the "other" recipient
            sentinel since the user isn't picking from the catalog. */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              const next = !customOpen;
              setCustomOpen(next);
              if (next) {
                // Opening custom flips the selection so Next reflects the
                // user's actual intent.
                set({ recipientType: "other" });
              } else if (payload.recipientType === "other") {
                // Closing it clears the custom selection so the user
                // isn't trapped in "other" without a visible textarea.
                set({ recipientType: undefined, outline: undefined });
              }
            }}
            className={`w-full text-left rounded-2xl border bg-cream-50 px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-gold-500 hover:shadow-[0_8px_24px_rgba(14,26,43,0.08)] ${
              customOpen || payload.recipientType === "other"
                ? "border-moss-500 ring-2 ring-moss-700"
                : "border-cream-300"
            }`}
            aria-expanded={customOpen}
          >
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-gold-100 text-gold-900 shrink-0"
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
              <div className="flex-1">
                <div className="font-[family-name:var(--font-display)] text-base text-ink-900">
                  Custom storybook
                </div>
                <p className="text-xs text-ink-500 mt-0.5">
                  None of the above? Describe the book you want in your own
                  words.
                </p>
              </div>
            </div>
          </button>

          {customOpen && (
            <div className="mt-2 rounded-2xl border border-cream-300 bg-cream-50 p-3 sm:p-4">
              <textarea
                value={customDraft}
                onChange={(e) => setCustomDraft(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-cream-300 bg-cream-50 p-3 text-ink-900 placeholder:text-ink-300 focus:border-moss-500 focus:outline-none focus:ring-2 focus:ring-moss-700/20"
                placeholder="A whimsical book about my best friend Sam, his vintage Vespa, and the imaginary city he commutes to every morning…"
              />
            </div>
          )}
        </div>
      </StepShell>
    );
  }

  if (step === 2) {
    return (
      <StepShell
        step={2}
        totalSteps={totalSteps}
        title="What's the occasion?"
        subtitle="Pick one — or skip if it doesn't apply."
        onBack={() => goBack(1)}
        onNext={() => goNext(3)}
        nextAtTop
        nextDisabled={!payload.occasion}
        nextLabel={returnToReview ? "Save changes" : "Next"}
        onSkip={() => {
          // Honor "Skip" by clearing any prior occasion selection.
          set({ occasion: undefined });
          goNext(3);
        }}
        editingReview={returnToReview}
        onExitReview={() => {
          setReturnToReview(false);
          navigateBack(7);
        }}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {OCCASIONS.map((o) => {
            const selected = payload.occasion === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => set({ occasion: o.id })}
                className={`group flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border bg-cream-50 transition-all duration-200 hover:-translate-y-0.5 hover:border-gold-500 hover:shadow-[0_8px_24px_rgba(14,26,43,0.08)] ${
                  selected
                    ? "border-moss-500 ring-2 ring-moss-700 bg-moss-100/40"
                    : "border-cream-300"
                }`}
              >
                <span
                  className={`${
                    selected ? "text-moss-700" : "text-ink-500 group-hover:text-moss-700"
                  } transition-colors`}
                  aria-hidden="true"
                >
                  <OccasionIcon id={o.id} />
                </span>
                <span
                  className={`text-sm font-medium ${
                    selected ? "text-moss-900" : "text-ink-900"
                  }`}
                >
                  {o.label}
                </span>
              </button>
            );
          })}
        </div>
      </StepShell>
    );
  }

  if (step === 3) {
    const selectedIds = new Set(payload.castCharacterIds ?? []);
    const returnTo = `/create/new?draft=${draft.id}`;
    const addHref = `/characters/new?next=${encodeURIComponent(returnTo)}`;
    const editHref = (charId: string) =>
      `/characters/${charId}?next=${encodeURIComponent(returnTo)}`;
    return (
      <StepShell
        step={3}
        totalSteps={totalSteps}
        title="Build Your Cast"
        subtitle="Add at least one character. Their photos let the AI keep them looking like them on every page."
        onBack={() => goBack(2)}
        onNext={() => goNext(4)}
        nextAtTop
        nextLabel={returnToReview ? "Save changes" : "Next"}
        nextDisabled={(payload.castCharacterIds ?? []).length === 0}
        editingReview={returnToReview}
        onExitReview={() => {
          setReturnToReview(false);
          navigateBack(7);
        }}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {characters.map((c) => {
            const selected = selectedIds.has(c.id);
            return (
              // Tile is a positioned wrapper rather than a single
              // <button> because the delete affordance needs to be a
              // sibling button; nesting buttons is invalid HTML.
              <div
                key={c.id}
                className={`relative rounded-2xl border bg-cream-50 overflow-hidden transition ${
                  selected
                    ? "border-moss-500 ring-2 ring-moss-700"
                    : "border-cream-300 hover:border-gold-500"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(selectedIds);
                    if (selected) next.delete(c.id);
                    else next.add(c.id);
                    set({ castCharacterIds: Array.from(next) });
                  }}
                  className="block w-full text-left"
                  aria-pressed={selected}
                  aria-label={`${selected ? "Deselect" : "Select"} ${c.name}`}
                >
                  <div className="aspect-square bg-cream-100">
                    {c.reference_photo_urls[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.reference_photo_urls[0]}
                        alt={c.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="p-2 text-sm">
                    <div className="font-medium text-ink-900">{c.name}</div>
                    <div className="text-ink-300 uppercase text-xs tracking-wide">
                      {c.kind}
                    </div>
                  </div>
                </button>
                {/* Selection badge — always rendered; only its colors
                    change so the tile doesn't shift on toggle. The ring
                    on the wrapper still carries the at-a-glance signal;
                    this badge makes it unambiguous at tile scale. */}
                <span
                  aria-hidden="true"
                  className={`absolute left-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 shadow-sm transition-colors ${
                    selected
                      ? "bg-moss-700 border-moss-700 text-cream-50"
                      : "bg-cream-50/95 border-cream-300 text-transparent"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                </span>
                {/* Per-tile action cluster: edit on the left, delete on
                    the right. Both stop propagation so they don't toggle
                    selection. The Edit link routes to the character form
                    with a `next` param so saving returns to this step. */}
                <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
                  <Link
                    href={editHref(c.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Edit ${c.name}`}
                    title={`Edit ${c.name}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-cream-50/95 text-ink-700 shadow-sm transition-colors hover:bg-moss-700 hover:text-cream-50 focus:outline-none focus:ring-2 focus:ring-moss-700/40"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="h-4 w-4"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                    </svg>
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteError(null);
                      setPendingDelete(c);
                    }}
                    aria-label={`Delete ${c.name}`}
                    title={`Delete ${c.name}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-cream-50/95 text-rose-600 shadow-sm transition-colors hover:bg-rose-500 hover:text-cream-50 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="h-4 w-4"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
          {/* Empty dashed tile that sits in the grid alongside the
              character tiles. Acts as the only "add character"
              affordance now that we've dropped the bottom text link. */}
          <Link
            href={addHref}
            className="group flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-cream-300 bg-cream-50/40 text-ink-500 transition hover:border-moss-700 hover:bg-moss-100/40 hover:text-moss-900"
            aria-label="Add another character"
          >
            <div className="aspect-square w-full flex flex-col items-center justify-center gap-2">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-current">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="h-5 w-5"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
              <span className="text-sm font-medium">
                {characters.length === 0
                  ? "Add your first character"
                  : "Add another character"}
              </span>
            </div>
          </Link>
        </div>

        {pendingDelete && (
          <DeleteCharacterModal
            character={pendingDelete}
            deleting={deletingCharacter}
            error={deleteError}
            onCancel={() => {
              if (deletingCharacter) return;
              setPendingDelete(null);
              setDeleteError(null);
            }}
            onConfirm={confirmDeleteCharacter}
          />
        )}
      </StepShell>
    );
  }

  if (step === 4) {
    const memoryRefs = payload.memories ?? [];
    const missingCaption = memoryRefs.some((m) => !m.caption.trim());
    return (
      <StepShell
        step={4}
        totalSteps={totalSteps}
        title="Your story outline"
        subtitle="What's the story about? Add any specific moments or details that should appear."
        onBack={() => goBack(3)}
        onNext={() => goNext(5)}
        nextAtTop
        nextLabel={returnToReview ? "Save changes" : "Next"}
        editingReview={returnToReview}
        onExitReview={() => {
          setReturnToReview(false);
          navigateBack(7);
        }}
        // Gate on outline content AND on every uploaded memory having a
        // caption — the AI needs the context to know how to use the
        // photo on a page.
        nextDisabled={!payload.outline?.trim() || missingCaption}
      >
        <div className="space-y-4">
          <textarea
            value={payload.outline ?? ""}
            onChange={(e) => set({ outline: e.target.value })}
            rows={6}
            className="w-full rounded-xl border border-cream-300 bg-cream-50 p-3 text-ink-900 placeholder:text-ink-300 focus:border-moss-500 focus:outline-none focus:ring-2 focus:ring-moss-700/20"
            placeholder="A magical adventure where Mom takes Maya on a road trip to find the world's biggest pancake…"
          />
          <MemoryReferencesEditor
            value={memoryRefs}
            onChange={(m) => set({ memories: m })}
          />
        </div>
      </StepShell>
    );
  }

  if (step === 5) {
    return (
      <StepShell
        step={5}
        totalSteps={totalSteps}
        title="Pick your art style"
        subtitle="Choose how you'd like your story illustrated."
        onBack={() => goBack(4)}
        onNext={() => goNext(6)}
        nextAtTop
        nextLabel={returnToReview ? "Save changes" : "Next"}
        nextDisabled={!payload.artStyleId}
        editingReview={returnToReview}
        onExitReview={() => {
          setReturnToReview(false);
          navigateBack(7);
        }}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {artStyles.map((s) => {
            const selected = payload.artStyleId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => set({ artStyleId: s.id })}
                className={`text-left rounded-2xl border bg-cream-50 overflow-hidden transition ${
                  selected
                    ? "border-moss-500 ring-2 ring-moss-700"
                    : "border-cream-300 hover:border-gold-500 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(14,26,43,0.08)]"
                }`}
              >
                <div className="aspect-[4/3] bg-cream-100">
                  {s.sample_image_urls[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.sample_image_urls[0]}
                      alt={s.display_name}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="p-2 text-sm font-medium text-ink-900">
                  {s.display_name}
                </div>
              </button>
            );
          })}
        </div>
      </StepShell>
    );
  }

  if (step === 6) {
    const pageCount = payload.pageCount ?? 16;
    const isHardcoverEligible = pageCount >= 24;
    return (
      <StepShell
        step={6}
        totalSteps={totalSteps}
        title="How long should it be?"
        subtitle="Pick a preset, or fine-tune the slider."
        onBack={() => goBack(5)}
        onNext={() => goNext(7)}
        nextAtTop
        nextLabel={returnToReview ? "Save changes" : "Continue"}
        editingReview={returnToReview}
        onExitReview={() => {
          setReturnToReview(false);
          navigateBack(7);
        }}
      >
        <div className="rounded-2xl border border-cream-300 bg-cream-50 p-5 sm:p-6 space-y-6">
          {/* Segmented preset chips. Tapping selects the value; the
              user advances via the top Next button. */}
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-ink-300 mb-2">
              Quick presets
            </div>
            <div className="flex flex-wrap gap-2">
              {PAGE_PRESETS.map((n) => {
                const selected = pageCount === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set({ pageCount: n })}
                    className={`px-4 py-2 rounded-full border text-sm font-medium transition ${
                      selected
                        ? "bg-moss-700 text-cream-50 border-moss-700"
                        : "bg-cream-50 border-cream-300 text-ink-700 hover:border-gold-500 hover:text-ink-900"
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Slider — continuous control, does NOT auto-advance. */}
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-ink-300 mb-2">
              Fine-tune
            </div>
            <div className="flex items-center gap-5">
              <input
                type="range"
                min={8}
                max={64}
                step={1}
                value={pageCount}
                onChange={(e) =>
                  set({ pageCount: parseInt(e.target.value, 10) || 16 })
                }
                className="page-count-slider flex-1"
                aria-label="Page count"
              />
              <div className="flex items-baseline gap-1.5 min-w-[5rem] justify-end">
                <span className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl font-semibold text-ink-900 leading-none">
                  {pageCount}
                </span>
                <span className="text-ink-500 text-sm">pages</span>
              </div>
            </div>
          </div>

          <div>
            {isHardcoverEligible ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-moss-100 text-moss-900 px-3 py-1 text-xs font-medium">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path d="M5 12l5 5L20 7" />
                </svg>
                Eligible for hardcover printing
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-cream-200 text-ink-500 px-3 py-1 text-xs font-medium">
                Digital only — too short for hardcover
              </span>
            )}
          </div>
        </div>

        {/* Text size — sets the AutoFitText cap on every page's
            layout-source narration. Standard is the codebase default
            (38). Younger reader → Large; longer narrations → Compact. */}
        <TextSizePicker
          value={payload.defaultTextSize}
          onChange={(n) => set({ defaultTextSize: n })}
        />

        <style jsx>{`
          .page-count-slider {
            -webkit-appearance: none;
            appearance: none;
            height: 6px;
            border-radius: 9999px;
            background: var(--color-cream-200);
            outline: none;
          }
          .page-count-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 22px;
            height: 22px;
            border-radius: 9999px;
            background: var(--color-moss-700);
            border: 3px solid var(--color-cream-50);
            box-shadow: 0 2px 6px rgba(31, 61, 46, 0.35);
            cursor: pointer;
            transition: transform 120ms ease;
          }
          .page-count-slider::-webkit-slider-thumb:hover {
            transform: scale(1.08);
          }
          .page-count-slider::-moz-range-thumb {
            width: 22px;
            height: 22px;
            border-radius: 9999px;
            background: var(--color-moss-700);
            border: 3px solid var(--color-cream-50);
            box-shadow: 0 2px 6px rgba(31, 61, 46, 0.35);
            cursor: pointer;
          }
        `}</style>
      </StepShell>
    );
  }

  // Step 7
  const selectedCast = characters.filter((c) =>
    (payload.castCharacterIds ?? []).includes(c.id)
  );
  const selectedStyle = artStyles.find((s) => s.id === payload.artStyleId);
  const recipientLabel = payload.recipientType
    ? RECIPIENT_LABELS[payload.recipientType] ?? payload.recipientType
    : "Not specified";
  const occasionLabel = payload.occasion
    ? OCCASION_LABELS[payload.occasion] ?? payload.occasion
    : "Not specified";
  const sampleStripUrls = (selectedStyle?.sample_image_urls ?? []).slice(0, 3);

  return (
    <StepShell
      step={7}
      totalSteps={totalSteps}
      title="Ready to generate?"
      subtitle="Review your inputs. You'll get to approve the cast portraits before pages render."
      onBack={() => goBack(6)}
      onNext={generate}
      nextAtTop
      nextLabel={generating ? "Sending…" : "Generate book"}
      // Require a non-empty title before committing — the inline title
      // input on this step is the user's last chance to name the book.
      nextDisabled={generating || !payload.title?.trim()}
      nextVariant="prominent"
    >
      <div className="space-y-4">
        {/* Generate-stage error banner. Sits at the top of Step 7 so a
            failed submit is immediately visible at the same eyeline
            as the Generate CTA in the top action row. The effect on
            `error` also smooth-scrolls the anchor into view. */}
        {error && (
          <div
            ref={errorAnchorRef}
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-900"
          >
            {error}
          </div>
        )}

        {/* Header card — art style sample strip behind the title gives
            the review a "magazine cover" feel rather than a form. The
            title field is rendered in place as an input that styles
            itself like a heading; the user clicks the title to rename
            the book. Leaving it blank lets the AI suggest one. */}
        <div className="relative overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-[0_1px_2px_rgba(14,26,43,0.04)]">
          <div className="absolute inset-0 flex">
            {sampleStripUrls.length > 0 ? (
              sampleStripUrls.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${url}-${i}`}
                  src={url}
                  alt=""
                  className="flex-1 object-cover opacity-70"
                />
              ))
            ) : (
              <div className="flex-1 bg-gradient-to-br from-moss-200/50 via-cream-100 to-gold-100/50" />
            )}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-cream-50 via-cream-50/85 to-cream-50/30" />
          <div className="relative p-6 sm:p-8">
            <label
              htmlFor="story-title"
              className="block text-[11px] uppercase tracking-[0.18em] text-gold-900 mb-1"
            >
              Story preview
            </label>
            <input
              id="story-title"
              type="text"
              value={payload.title ?? ""}
              onChange={(e) => set({ title: e.target.value })}
              maxLength={120}
              placeholder="Untitled story"
              aria-label="Book title"
              className="w-full bg-transparent border-0 border-b-2 border-transparent px-0 py-1 font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold text-ink-900 leading-tight placeholder:text-ink-300 placeholder:italic hover:border-cream-300 focus:outline-none focus:border-moss-700 transition-colors"
            />
          </div>
        </div>

        {/* Summary grid — each card jumps to its origin step in
            edit-mode. The hover hint ("Edit →") only appears on
            interactive cards. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SummaryCard
            label="Recipient"
            value={recipientLabel}
            onEdit={() => editFromReview(1)}
          />
          <SummaryCard
            label="Occasion"
            value={occasionLabel}
            onEdit={() => editFromReview(2)}
          />
          <SummaryCard
            label="Pages"
            value={String(payload.pageCount ?? 16)}
            onEdit={() => editFromReview(6)}
          />
          <SummaryCard
            label="Style"
            value={selectedStyle?.display_name ?? "Not specified"}
            onEdit={() => editFromReview(5)}
          />
        </div>

        {/* Cast strip — clickable, jumps to step 3 in edit mode. */}
        <button
          type="button"
          onClick={() => editFromReview(3)}
          className="group block w-full text-left rounded-2xl border border-cream-300 bg-cream-50 p-4 sm:p-5 transition hover:border-gold-500 hover:shadow-[0_4px_12px_rgba(14,26,43,0.06)] cursor-pointer"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-ink-300">
              Cast
            </div>
            <span className="text-[11px] font-medium text-moss-700 opacity-0 transition-opacity group-hover:opacity-100">
              Edit →
            </span>
          </div>
          {selectedCast.length === 0 ? (
            <div className="text-sm text-ink-500">No cast selected.</div>
          ) : (
            <ul className="flex flex-wrap gap-x-5 gap-y-3">
              {selectedCast.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col items-center gap-1.5 w-16"
                >
                  <div className="h-14 w-14 rounded-full overflow-hidden bg-cream-100 border border-cream-300">
                    {c.reference_photo_urls[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.reference_photo_urls[0]}
                        alt={c.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <span className="text-xs text-ink-700 text-center truncate w-full">
                    {c.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </button>

        {/* Outline — clickable, jumps to step 4 in edit mode. */}
        <button
          type="button"
          onClick={() => editFromReview(4)}
          className="group block w-full text-left rounded-2xl border border-cream-300 bg-cream-50 p-4 sm:p-5 transition hover:border-gold-500 hover:shadow-[0_4px_12px_rgba(14,26,43,0.06)] cursor-pointer"
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-ink-300">
              Story outline
            </div>
            <span className="text-[11px] font-medium text-moss-700 opacity-0 transition-opacity group-hover:opacity-100">
              Edit →
            </span>
          </div>
          {payload.outline?.trim() ? (
            <p className="whitespace-pre-wrap text-ink-700 text-sm leading-relaxed">
              {payload.outline}
            </p>
          ) : (
            <p className="text-sm text-ink-500">No outline provided.</p>
          )}
        </button>
      </div>

    </StepShell>
  );
}

// ---------------------------------------------------------------------------
// Step 7 helpers
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit?: () => void;
}) {
  const baseClasses =
    "group block w-full text-left rounded-xl border border-cream-300 bg-cream-50 p-4 transition";
  const interactiveClasses = onEdit
    ? " hover:border-gold-500 hover:shadow-[0_4px_12px_rgba(14,26,43,0.06)] cursor-pointer"
    : "";
  const body = (
    <>
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-300">
          {label}
        </div>
        {onEdit && (
          <span className="text-[11px] font-medium text-moss-700 opacity-0 transition-opacity group-hover:opacity-100">
            Edit →
          </span>
        )}
      </div>
      <div className="text-ink-900 font-medium text-sm break-words">
        {value}
      </div>
    </>
  );
  if (onEdit) {
    return (
      <button type="button" onClick={onEdit} className={baseClasses + interactiveClasses}>
        {body}
      </button>
    );
  }
  return <div className={baseClasses}>{body}</div>;
}

// Three-preset text-size picker rendered inside Step 6. Values are the
// logical-px caps that flow through to stories.default_text_size and
// AutoFitText. Null/undefined value means "use codebase default".
const TEXT_SIZE_PRESETS: Array<{ id: string; label: string; size: number; sample: string }> = [
  { id: "compact", label: "Compact", size: 28, sample: "Aa" },
  { id: "standard", label: "Standard", size: 38, sample: "Aa" },
  { id: "large", label: "Large", size: 48, sample: "Aa" },
];

function TextSizePicker({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (n: number) => void;
}) {
  // Default to "Standard" (38) when unset, so the visual reflects what
  // the codebase will use on submit.
  const active = value ?? 38;
  return (
    <div className="rounded-2xl border border-cream-300 bg-cream-50 p-5 sm:p-6">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-ink-300">
            Default text size
          </div>
          <p className="mt-1 text-sm text-ink-500">
            How big the narration appears on each page. You can tweak per
            page later in the Studio.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {TEXT_SIZE_PRESETS.map((p) => {
          const selected = active === p.size;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.size)}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border bg-cream-50 px-3 py-4 transition-all ${
                selected
                  ? "border-moss-500 ring-2 ring-moss-700 bg-moss-100/40"
                  : "border-cream-300 hover:border-gold-500 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(14,26,43,0.06)]"
              }`}
            >
              <span
                className={`font-[family-name:var(--font-display)] leading-none ${
                  selected ? "text-moss-900" : "text-ink-900"
                }`}
                style={{ fontSize: `${Math.round(p.size * 0.55)}px` }}
                aria-hidden="true"
              >
                {p.sample}
              </span>
              <span
                className={`text-xs font-medium ${
                  selected ? "text-moss-900" : "text-ink-700"
                }`}
              >
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 occasion glyphs — small inline SVGs (20–24px) so we don't need
// a new icon-set dependency. Each is a single-color stroke icon that
// inherits color from the parent (`text-moss-700` selected, `text-ink-500`
// default), matching the rest of the palette.
// ---------------------------------------------------------------------------

function OccasionIcon({ id }: { id: Occasion }) {
  const props = {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-6 w-6",
  };
  switch (id) {
    case "birthday":
      // Gift box
      return (
        <svg {...props}>
          <rect x="3.5" y="9" width="17" height="11" rx="1.5" />
          <path d="M3.5 13h17" />
          <path d="M12 9v11" />
          <path d="M8.5 9c-1.5 0-2.5-1-2.5-2.5S7 4 8.5 4c1.7 0 3.5 2 3.5 5" />
          <path d="M15.5 9c1.5 0 2.5-1 2.5-2.5S17 4 15.5 4C13.8 4 12 6 12 9" />
        </svg>
      );
    case "anniversary":
      // Ring with stone
      return (
        <svg {...props}>
          <circle cx="12" cy="15" r="5" />
          <path d="M9 9l3-5 3 5" />
        </svg>
      );
    case "memorial":
      // Candle with flame
      return (
        <svg {...props}>
          <rect x="9" y="11" width="6" height="9" rx="1" />
          <path d="M9 14h6" />
          <path d="M12 11V8" />
          <path d="M12 7c-1.2-1.5 0-3 0-4 0 1 1.2 2.5 0 4z" />
        </svg>
      );
    case "just_because":
      // Heart
      return (
        <svg {...props}>
          <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />
        </svg>
      );
    case "graduation":
      // Mortarboard cap
      return (
        <svg {...props}>
          <path d="M2 9l10-4 10 4-10 4-10-4z" />
          <path d="M6 11v4c0 1.5 2.7 3 6 3s6-1.5 6-3v-4" />
          <path d="M22 9v5" />
        </svg>
      );
    case "holiday":
      // Snowflake
      return (
        <svg {...props}>
          <path d="M12 3v18" />
          <path d="M3 12h18" />
          <path d="M5.5 5.5l13 13" />
          <path d="M18.5 5.5l-13 13" />
          <path d="M9.5 4.5L12 7l2.5-2.5" />
          <path d="M9.5 19.5L12 17l2.5 2.5" />
          <path d="M4.5 9.5L7 12l-2.5 2.5" />
          <path d="M19.5 9.5L17 12l2.5 2.5" />
        </svg>
      );
    case "new_baby":
      // Baby (face + ear hint)
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="7" />
          <circle cx="9.5" cy="11" r="0.7" fill="currentColor" />
          <circle cx="14.5" cy="11" r="0.7" fill="currentColor" />
          <path d="M9.5 14.5c.8.7 1.6 1 2.5 1s1.7-.3 2.5-1" />
          <path d="M5 11c-1 0-2 .8-2 2s1 2 2 2" />
        </svg>
      );
    case "achievement":
      // Trophy
      return (
        <svg {...props}>
          <path d="M8 4h8v5a4 4 0 01-8 0V4z" />
          <path d="M8 6H5v2a3 3 0 003 3" />
          <path d="M16 6h3v2a3 3 0 01-3 3" />
          <path d="M10 14h4v3h-4z" />
          <path d="M8 20h8" />
          <path d="M12 17v3" />
        </svg>
      );
  }
}

// Upload zone + caption inputs for the wizard's "reference photos &
// memories" section. Each entry pairs a Supabase Storage URL (uploaded
// via /api/upload, same path the character form uses) with a short
// caption that gives the AI context for how to use the photo. Captions
// are required before the wizard advances — the parent gates Next on
// `m.caption.trim()` for every entry.
const MAX_MEMORY_PHOTOS = 10;

function MemoryReferencesEditor({
  value,
  onChange,
}: {
  value: MemoryReference[];
  onChange: (next: MemoryReference[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function uploadOne(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) throw new Error(await res.text());
    const body = (await res.json()) as { url: string };
    return body.url;
  }

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const room = MAX_MEMORY_PHOTOS - value.length;
    if (room <= 0) {
      setUploadError(`Max ${MAX_MEMORY_PHOTOS} photos.`);
      e.target.value = "";
      return;
    }
    const trimmed = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, room);
    if (trimmed.length === 0) {
      e.target.value = "";
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded: MemoryReference[] = [];
      for (const f of trimmed) {
        const url = await uploadOne(f);
        uploaded.push({
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `mem-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`,
          photoUrl: url,
          caption: "",
        });
      }
      onChange([...value, ...uploaded]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function updateCaption(id: string, caption: string) {
    onChange(value.map((m) => (m.id === id ? { ...m, caption } : m)));
  }
  function removeOne(id: string) {
    onChange(value.filter((m) => m.id !== id));
  }

  const slotsLeft = MAX_MEMORY_PHOTOS - value.length;

  return (
    <div className="rounded-2xl border border-cream-300 bg-cream-50 p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">
            Reference photos &amp; memories{" "}
            <span className="font-normal text-ink-500">(optional)</span>
          </h3>
          <p className="mt-0.5 text-xs text-ink-500">
            Upload up to {MAX_MEMORY_PHOTOS} photos that should appear in the
            book. Add a short caption so the AI knows what each memory is about
            — every photo will be woven into at least one page.
          </p>
        </div>
        <span className="text-xs text-ink-300 shrink-0">
          {value.length}/{MAX_MEMORY_PHOTOS}
        </span>
      </div>

      <ul className="space-y-2">
        {value.map((m) => (
          <li
            key={m.id}
            className="flex items-stretch gap-3 rounded-xl border border-cream-300 bg-cream-50 p-2"
          >
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-cream-100 border border-cream-300">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.photoUrl}
                alt={m.caption || "Memory photo"}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex-1 flex flex-col">
              <textarea
                value={m.caption}
                onChange={(e) => updateCaption(m.id, e.target.value)}
                rows={2}
                placeholder="What is this photo? e.g. 'Grandma's kitchen with the red apron'"
                className="flex-1 w-full resize-none rounded-lg border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:border-moss-500 focus:outline-none focus:ring-2 focus:ring-moss-700/20"
              />
              {!m.caption.trim() && (
                <p className="mt-1 text-[11px] font-medium text-rose-600">
                  Caption required.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeOne(m.id)}
              aria-label="Remove memory photo"
              className="self-start rounded-full px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 transition"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {slotsLeft > 0 && (
        <label
          className={`mt-3 group relative flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-4 text-center transition-all ${
            value.length === 0 ? "py-6" : "py-4"
          } border-moss-500/60 bg-moss-100/40 hover:border-moss-700 hover:bg-moss-100`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`shrink-0 text-moss-700 ${
              value.length === 0 ? "h-7 w-7" : "h-5 w-5"
            }`}
          >
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            <polyline points="7 9 12 4 17 9" />
            <line x1="12" y1="4" x2="12" y2="16" />
          </svg>
          <div className="text-sm font-semibold text-ink-900">
            {uploading
              ? "Uploading…"
              : value.length === 0
                ? "Upload reference photos"
                : `+ Add more (${value.length}/${MAX_MEMORY_PHOTOS})`}
          </div>
          {value.length === 0 && (
            <div className="text-xs text-ink-500">
              Click to choose images. JPG or PNG, up to {MAX_MEMORY_PHOTOS}.
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={uploading}
            onChange={handlePick}
            className="sr-only"
            aria-label="Upload reference photos"
          />
        </label>
      )}

      {uploadError && (
        <p className="mt-2 text-sm font-medium text-rose-600">{uploadError}</p>
      )}
    </div>
  );
}

// Lightweight delete confirmation dialog rendered from Step 3. Plain
// fixed-position modal with backdrop click + Escape to cancel; deliberately
// avoids the browser confirm() since it's blocking and not styleable.
function DeleteCharacterModal({
  character,
  deleting,
  error,
  onCancel,
  onConfirm,
}: {
  character: Character;
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleting) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleting, onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-character-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-ink-900/50"
        onClick={() => {
          if (!deleting) onCancel();
        }}
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-cream-300 bg-cream-50 p-6 shadow-[0_20px_50px_rgba(14,26,43,0.25)]">
        <h2
          id="delete-character-title"
          className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900"
        >
          Delete {character.name}?
        </h2>
        <p className="mt-2 text-sm text-ink-700">
          This removes the character and their reference photos. Stories that
          already use them stay intact, but they won&apos;t appear in the cast
          picker again.
        </p>
        {error && (
          <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>
        )}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 rounded-xl text-sm font-medium text-ink-700 hover:text-ink-900 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-cream-50 bg-rose-600 hover:bg-rose-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
