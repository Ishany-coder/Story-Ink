"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ExampleBooksGallery from "@/components/ExampleBooksGallery";
import StepShell from "./StepShell";
import type {
  ArtStyle,
  Character,
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

  // Helper: pick a recipient + immediately move to step 2. Used by every
  // tile in step 1 since the spec requires single-tap navigation.
  const pickRecipientAndAdvance = (id: RecipientType) => {
    set({ recipientType: id });
    setStep(2);
  };

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
          keyMemories: payload.keyMemories ?? [],
          artStyleId: payload.artStyleId,
          pageCount: payload.pageCount ?? 16,
          title: payload.title,
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
    return (
      <StepShell
        step={1}
        totalSteps={totalSteps}
        title="Who is this book for?"
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PRIMARY_RECIPIENTS.map((r) => {
            const selected = payload.recipientType === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => pickRecipientAndAdvance(r.id)}
                className={`text-left rounded-2xl border bg-cream-50 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-gold-500 hover:shadow-[0_8px_24px_rgba(14,26,43,0.08)] ${
                  selected
                    ? "border-moss-500 ring-2 ring-moss-700 bg-moss-100/40"
                    : "border-cream-300"
                }`}
              >
                <div className="aspect-[4/3] bg-cream-100">
                  {r.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.imageUrl}
                      alt={r.label}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="p-3 text-center text-sm font-medium text-ink-900">
                  {r.label}
                </div>
              </button>
            );
          })}
        </div>

        <details className="mt-6" open={moreSelected}>
          <summary className="cursor-pointer text-sm font-medium text-ink-700 mb-3 select-none">
            More options…
          </summary>
          <div className="flex flex-wrap gap-2 pt-2">
            {MORE_RECIPIENTS.map((r) => {
              const selected = payload.recipientType === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pickRecipientAndAdvance(r.id)}
                  className={`px-4 py-2 rounded-full border text-sm transition ${
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
            inline textarea; on Continue the freeform prompt is stored in
            payload.outline and we fall back to the "other" recipient
            sentinel since the user isn't picking from the catalog. */}
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setCustomOpen((v) => !v)}
            className={`w-full text-left rounded-2xl border bg-cream-50 px-5 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-gold-500 hover:shadow-[0_8px_24px_rgba(14,26,43,0.08)] ${
              customOpen
                ? "border-moss-500 ring-2 ring-moss-700"
                : "border-cream-300"
            }`}
            aria-expanded={customOpen}
          >
            <div className="flex items-start gap-3">
              <span
                className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-gold-100 text-gold-900 shrink-0"
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
                <div className="font-[family-name:var(--font-display)] text-lg text-ink-900">
                  Custom storybook
                </div>
                <p className="text-sm text-ink-500 mt-0.5">
                  None of the above? Describe the book you want in your own
                  words.
                </p>
              </div>
            </div>
          </button>

          {customOpen && (
            <div className="mt-3 rounded-2xl border border-cream-300 bg-cream-50 p-4 sm:p-5">
              <label className="block text-sm font-medium text-ink-700 mb-2">
                Describe your storybook
              </label>
              <textarea
                value={customDraft}
                onChange={(e) => setCustomDraft(e.target.value)}
                rows={6}
                className="w-full rounded-xl border border-cream-300 bg-white p-3 text-ink-900 placeholder:text-ink-300 focus:border-moss-500 focus:outline-none focus:ring-2 focus:ring-moss-700/20"
                placeholder="A whimsical book about my best friend Sam, his vintage Vespa, and the imaginary city he commutes to every morning…"
              />
              <div className="mt-3 flex items-center justify-end">
                <button
                  type="button"
                  disabled={!customDraft.trim()}
                  onClick={() => {
                    set({
                      // "other" is the closest existing RecipientType
                      // sentinel — it's already in the API allowlist and
                      // recipientLabel falls back to "someone you love",
                      // which fits a freeform prompt.
                      recipientType: "other",
                      outline: customDraft.trim(),
                    });
                    setStep(2);
                  }}
                  className="px-6 py-2 bg-moss-700 text-cream-50 rounded-xl font-medium hover:bg-moss-900 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sample storybook covers so the first-time user can see what
            kind of artifact they're about to build. Lives on Step 1
            because that's the moment of greatest "what am I doing
            here?" uncertainty. Subsequent steps assume the user has
            committed to the flow. */}
        <div className="mt-10">
          <ExampleBooksGallery compact />
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
        onBack={() => setStep(1)}
        onSkip={() => {
          // Honor "Skip" by clearing any prior occasion selection.
          set({ occasion: undefined });
          setStep(3);
        }}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {OCCASIONS.map((o) => {
            const selected = payload.occasion === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  set({ occasion: o.id });
                  setStep(3);
                }}
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
    return (
      <StepShell
        step={3}
        totalSteps={totalSteps}
        title="Build the cast"
        subtitle="Add at least one character. Their photos let the AI keep them looking like them on every page."
        onBack={() => setStep(2)}
        onNext={() => setStep(4)}
        nextDisabled={(payload.castCharacterIds ?? []).length === 0}
      >
        <div className="space-y-4">
          {characters.length === 0 && (
            <div className="border border-cream-300 rounded-2xl p-6 text-center bg-cream-50">
              <p className="text-ink-700 mb-3">
                You haven&apos;t added any characters yet.
              </p>
              <Link
                href={`/characters/new?next=${encodeURIComponent(
                  `/create/new?draft=${draft.id}`
                )}`}
                className="px-4 py-2 bg-moss-700 text-cream-50 rounded-xl inline-block hover:bg-moss-900 transition"
              >
                Add your first character
              </Link>
            </div>
          )}
          {characters.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {characters.map((c) => {
                  const selected = selectedIds.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        const next = new Set(selectedIds);
                        if (selected) next.delete(c.id);
                        else next.add(c.id);
                        set({ castCharacterIds: Array.from(next) });
                      }}
                      className={`text-left rounded-2xl border bg-cream-50 overflow-hidden transition ${
                        selected
                          ? "border-moss-500 ring-2 ring-moss-700"
                          : "border-cream-300 hover:border-gold-500"
                      }`}
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
                  );
                })}
              </div>
              <Link
                href={`/characters/new?next=${encodeURIComponent(
                  `/create/new?draft=${draft.id}`
                )}`}
                className="inline-block text-moss-700 hover:text-moss-900 underline-offset-4 hover:underline font-medium"
              >
                + Add another character
              </Link>
            </>
          )}
        </div>
      </StepShell>
    );
  }

  if (step === 4) {
    const memories = payload.keyMemories ?? [];
    return (
      <StepShell
        step={4}
        totalSteps={totalSteps}
        title="Your story outline"
        subtitle="What's the story about? Add any specific moments or details that should appear."
        onBack={() => setStep(3)}
        onNext={() => setStep(5)}
        nextDisabled={!payload.outline?.trim()}
      >
        <div className="space-y-4">
          <textarea
            value={payload.outline ?? ""}
            onChange={(e) => set({ outline: e.target.value })}
            rows={6}
            className="w-full rounded-xl border border-cream-300 bg-cream-50 p-3 text-ink-900 placeholder:text-ink-300 focus:border-moss-500 focus:outline-none focus:ring-2 focus:ring-moss-700/20"
            placeholder="A magical adventure where Mom takes Maya on a road trip to find the world's biggest pancake…"
          />
          <KeyMemoriesEditor
            value={memories}
            onChange={(m) => set({ keyMemories: m })}
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
        onBack={() => setStep(4)}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {artStyles.map((s) => {
            const selected = payload.artStyleId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  set({ artStyleId: s.id });
                  setStep(6);
                }}
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
        onBack={() => setStep(5)}
        onNext={() => setStep(7)}
      >
        <div className="rounded-2xl border border-cream-300 bg-cream-50 p-5 sm:p-6 space-y-6">
          {/* Segmented preset chips. Tapping advances to step 7 since
              the user has expressed a clear, complete preference. */}
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
                    onClick={() => {
                      set({ pageCount: n });
                      setStep(7);
                    }}
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
      onBack={() => setStep(6)}
      onNext={generate}
      nextLabel={generating ? "Sending…" : "Generate book"}
      nextDisabled={generating}
      nextVariant="prominent"
    >
      <div className="space-y-4">
        {/* Header card — art style sample strip behind the title gives
            the review a "magazine cover" feel rather than a form. */}
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
            <div className="text-[11px] uppercase tracking-[0.18em] text-gold-900 mb-1">
              Story preview
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold text-ink-900 leading-tight">
              {payload.title?.trim() || "Untitled story"}
            </h2>
          </div>
        </div>

        {/* Summary grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SummaryCard label="Recipient" value={recipientLabel} />
          <SummaryCard label="Occasion" value={occasionLabel} />
          <SummaryCard label="Pages" value={String(payload.pageCount ?? 16)} />
          <SummaryCard
            label="Style"
            value={selectedStyle?.display_name ?? "Not specified"}
          />
        </div>

        {/* Cast strip */}
        <div className="rounded-2xl border border-cream-300 bg-cream-50 p-4 sm:p-5">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-300 mb-3">
            Cast
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
        </div>

        {/* Outline */}
        <div className="rounded-2xl border border-cream-300 bg-cream-50 p-4 sm:p-5">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-300 mb-2">
            Story outline
          </div>
          {payload.outline?.trim() ? (
            <p className="whitespace-pre-wrap text-ink-700 text-sm leading-relaxed">
              {payload.outline}
            </p>
          ) : (
            <p className="text-sm text-ink-500">No outline provided.</p>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-900 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}
    </StepShell>
  );
}

// ---------------------------------------------------------------------------
// Step 7 helpers
// ---------------------------------------------------------------------------

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-cream-300 bg-cream-50 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-ink-300 mb-1">
        {label}
      </div>
      <div className="text-ink-900 font-medium text-sm break-words">
        {value}
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

function KeyMemoriesEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const t = draft.trim();
    if (!t) return;
    onChange([...value, t]);
    setDraft("");
  }
  return (
    <div>
      <label className="block text-sm font-medium text-ink-700 mb-1">
        Key memories (optional)
      </label>
      <div className="flex gap-2 mb-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder='e.g. "trip to Maine 2019"'
          className="flex-1 rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-ink-900 placeholder:text-ink-300 focus:border-moss-500 focus:outline-none focus:ring-2 focus:ring-moss-700/20"
        />
        <button
          type="button"
          onClick={add}
          className="px-4 py-2 rounded-xl border border-cream-300 bg-cream-50 text-ink-700 hover:border-gold-500 transition"
        >
          Add
        </button>
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((m, i) => (
            <li
              key={`${i}-${m}`}
              className="inline-flex items-center gap-1 bg-cream-100 border border-cream-300 rounded-full px-3 py-1 text-sm text-ink-700"
            >
              {m}
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="text-ink-300 hover:text-ink-700 transition"
                aria-label="remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
