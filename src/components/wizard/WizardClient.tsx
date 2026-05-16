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
  StoryTone,
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

const OCCASIONS: { id: Occasion; label: string }[] = [
  { id: "birthday", label: "Birthday" },
  { id: "anniversary", label: "Anniversary" },
  { id: "memorial", label: "Memorial" },
  { id: "just_because", label: "Just because" },
  { id: "graduation", label: "Graduation" },
  { id: "holiday", label: "Holiday" },
  { id: "new_baby", label: "New baby" },
  { id: "other", label: "Other" },
];

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
        onNext={() => setStep(2)}
        nextDisabled={!payload.recipientType}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PRIMARY_RECIPIENTS.map((r) => {
            const selected = payload.recipientType === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => set({ recipientType: r.id })}
                className={`text-left rounded-lg border bg-white overflow-hidden transition ${
                  selected ? "ring-2 ring-black" : "hover:shadow-sm"
                }`}
              >
                <div className="aspect-[4/3] bg-stone-100">
                  {r.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.imageUrl}
                      alt={r.label}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="p-3 text-center text-sm font-medium">
                  {r.label}
                </div>
              </button>
            );
          })}
        </div>

        <details className="mt-6" open={moreSelected}>
          <summary className="cursor-pointer text-sm font-medium text-stone-700 mb-3 select-none">
            More options…
          </summary>
          <div className="flex flex-wrap gap-2 pt-2">
            {MORE_RECIPIENTS.map((r) => {
              const selected = payload.recipientType === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => set({ recipientType: r.id })}
                  className={`px-4 py-2 rounded-full border text-sm ${
                    selected ? "bg-black text-white border-black" : "bg-white"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </details>

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
        onBack={() => setStep(1)}
        onNext={() => setStep(3)}
        nextDisabled={!payload.occasion}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {OCCASIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => set({ occasion: o.id })}
              className={`p-4 rounded border text-center ${
                payload.occasion === o.id ? "bg-black text-white" : "bg-white"
              }`}
            >
              {o.label}
            </button>
          ))}
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
            <div className="border rounded-lg p-6 text-center bg-stone-50">
              <p className="text-stone-700 mb-3">
                You haven&apos;t added any characters yet.
              </p>
              <Link
                href={`/characters/new?next=${encodeURIComponent(
                  `/create/new?draft=${draft.id}`
                )}`}
                className="px-4 py-2 bg-black text-white rounded inline-block"
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
                      className={`text-left rounded border overflow-hidden ${
                        selected ? "ring-2 ring-black" : ""
                      }`}
                    >
                      <div className="aspect-square bg-stone-100">
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
                        <div className="font-medium">{c.name}</div>
                        <div className="text-stone-500 uppercase text-xs">
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
                className="inline-block underline"
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
            className="w-full border rounded p-3"
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
        onNext={() => setStep(6)}
        nextDisabled={!payload.artStyleId}
      >
        <div className="mb-4">
          <div className="text-sm font-medium mb-2">Story style</div>
          <div className="inline-flex border rounded overflow-hidden">
            {(["classic", "rhyming"] as StoryTone[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set({ storyTone: t })}
                className={`px-4 py-2 text-sm ${
                  (payload.storyTone ?? "classic") === t
                    ? "bg-black text-white"
                    : "bg-white"
                }`}
              >
                {t === "classic" ? "Classic" : "Rhyming"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {artStyles.map((s) => {
            const selected = payload.artStyleId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => set({ artStyleId: s.id })}
                className={`text-left rounded border overflow-hidden ${
                  selected ? "ring-2 ring-black" : ""
                }`}
              >
                <div className="aspect-[4/3] bg-stone-100">
                  {s.sample_image_urls[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.sample_image_urls[0]}
                      alt={s.display_name}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="p-2 text-sm font-medium">{s.display_name}</div>
              </button>
            );
          })}
        </div>
      </StepShell>
    );
  }

  if (step === 6) {
    const pageCount = payload.pageCount ?? 16;
    return (
      <StepShell
        step={6}
        totalSteps={totalSteps}
        title="How long should it be?"
        subtitle="≥ 24 pages can be ordered as a hardcover. Shorter is digital-only."
        onBack={() => setStep(5)}
        onNext={() => setStep(7)}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PAGE_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => set({ pageCount: n })}
                className={`px-4 py-2 rounded border ${
                  pageCount === n ? "bg-black text-white" : "bg-white"
                }`}
              >
                {n} pages
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm text-stone-600 mb-1">
              Custom (8–64)
            </label>
            <input
              type="number"
              min={8}
              max={64}
              value={pageCount}
              onChange={(e) =>
                set({
                  pageCount: Math.min(
                    Math.max(parseInt(e.target.value, 10) || 16, 8),
                    64
                  ),
                })
              }
              className="border rounded px-3 py-2 w-32"
            />
          </div>
          <p className="text-sm text-stone-500">
            {pageCount >= 24
              ? "✓ Eligible for hardcover printing."
              : "Digital only — too short for hardcover."}
          </p>
        </div>
      </StepShell>
    );
  }

  // Step 7
  const selectedCast = characters.filter((c) =>
    (payload.castCharacterIds ?? []).includes(c.id)
  );
  const selectedStyle = artStyles.find((s) => s.id === payload.artStyleId);
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
    >
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-stone-500">Recipient</dt>
          <dd className="font-medium">{payload.recipientType}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Occasion</dt>
          <dd className="font-medium">{payload.occasion}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Cast</dt>
          <dd className="font-medium">
            {selectedCast.map((c) => c.name).join(", ") || "(none)"}
          </dd>
        </div>
        <div>
          <dt className="text-stone-500">Outline</dt>
          <dd className="font-medium whitespace-pre-wrap">{payload.outline}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Style</dt>
          <dd className="font-medium">{selectedStyle?.display_name}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Pages</dt>
          <dd className="font-medium">{payload.pageCount ?? 16}</dd>
        </div>
      </dl>
      {error && <div className="text-red-600 text-sm mt-4">{error}</div>}
    </StepShell>
  );
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
      <label className="block text-sm font-medium mb-1">
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
          className="flex-1 border rounded px-3 py-2"
        />
        <button
          type="button"
          onClick={add}
          className="px-4 py-2 border rounded"
        >
          Add
        </button>
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((m, i) => (
            <li
              key={`${i}-${m}`}
              className="inline-flex items-center gap-1 bg-stone-100 rounded px-2 py-1 text-sm"
            >
              {m}
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="text-stone-500"
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
