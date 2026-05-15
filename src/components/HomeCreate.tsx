"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import GeneratingOverlay from "./GeneratingOverlay";
import LegalConsentModal, { readStoredConsent } from "./LegalConsentModal";
import PetAvatar from "./PetAvatar";
import { isBetaTesting } from "@/lib/beta-flag";
import { useJobPolling } from "@/lib/useJobPolling";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { startersForMode } from "@/lib/story-starters";
import {
  DEFAULT_IMAGE_STYLE,
  IMAGE_STYLES,
  type ImageStyleId,
} from "@/lib/image-styles";
import { STORY_TEMPLATES, type StoryTemplate } from "@/lib/story-templates";
import type { Pet } from "@/lib/types";

// Page-count options. 6 is the practical story floor; 800 is the cap.
// Hardcover printing additionally requires >= 24 pages — picking a
// shorter length is fine but the /ship checkout will offer digital
// only. A small badge on chips below 24 hints at that constraint.
const PAGE_OPTIONS = [8, 16, 24, 30, 40, 60];
const MIN_PAGES = 6;
const MAX_PAGES = 800;
const PRINT_MIN_PAGES = 24;

interface Props {
  pets: Pet[];
}

// Home-page create flow. Pet mode is the default when the user has at
// least one pet; "Generic" remains available as a non-pet path.
//
// Visual language is intentionally restrained — single signature
// gradient on the primary CTA, soft borders elsewhere, no decorative
// emoji or runaway animations.
export default function HomeCreate({ pets }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // If we landed here from PetForm's post-create redirect
  // (`/create?petId=…`), preselect that pet. Falls back to the
  // newest pet (pets are already ordered by created_at desc on the
  // server). Guard against a stale id pointing at a deleted pet by
  // checking the lookup table.
  const requestedPetId = searchParams?.get("petId") ?? null;
  const initialPetId = useMemo(() => {
    if (requestedPetId && pets.some((p) => p.id === requestedPetId)) {
      return requestedPetId;
    }
    return pets[0]?.id ?? null;
  }, [pets, requestedPetId]);

  // Template chooser state. Start in pet template mode when arriving
  // from a ?petId= redirect (e.g. just added a pet); otherwise show
  // the template chooser as step 1.
  const [selectedTemplate, setSelectedTemplate] =
    useState<StoryTemplate | null>(() => {
      if (requestedPetId && pets.some((p) => p.id === requestedPetId)) {
        return STORY_TEMPLATES.find((t) => t.id === "pet") ?? null;
      }
      return null;
    });

  // Default to pet mode in both cases. With zero pets we still show
  // the empty PetPicker (which carries the "Add a pet to get started"
  // CTA) and surface Generic as a small text-link escape hatch below
  // it — that way the primary funnel for new users is the pet path.
  const [kind, setKind] = useState<"pet" | "generic">(
    selectedTemplate?.kind ?? "pet"
  );
  const [petId, setPetId] = useState<string | null>(initialPetId);
  const [prompt, setPrompt] = useState("");
  const [pageCount, setPageCount] = useState(MIN_PAGES);
  const [customMode, setCustomMode] = useState(false);
  const [imageMode, setImageMode] = useState<"fast" | "quality">("quality");
  const [imageStyle, setImageStyle] =
    useState<ImageStyleId>(DEFAULT_IMAGE_STYLE);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [generatingProgress, setGeneratingProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  // First-time consent gate. Read lazily at submit time — checking
  // localStorage on mount would require a setState-in-effect dance
  // that triggers a lint rule (and an extra render) for no benefit;
  // the user only cares about the gate when they're about to submit.
  const [consentModalOpen, setConsentModalOpen] = useState(false);

  // Mobile awareness banner. Tells phone users up front that they can
  // create and read on their device but the Studio (page editor)
  // needs a tablet/desktop. Dismissible per-mount; we don't persist
  // because a) it's a small one-liner and b) the surface is the very
  // first thing a new user sees, so re-showing it on a fresh visit is
  // fine.
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [mobileNoticeDismissed, setMobileNoticeDismissed] = useState(false);
  const betaOn = isBetaTesting();

  const { state, start } = useJobPolling<{ storyId: string }>();

  const selectedPet = useMemo(
    () => pets.find((p) => p.id === petId) ?? null,
    [pets, petId]
  );

  const starters = useMemo(
    () => (selectedPet ? startersForMode(selectedPet.mode) : []),
    [selectedPet]
  );

  useEffect(() => {
    if (state.kind === "done") {
      // ?fresh=1 triggers a one-time tip strip in the reader telling
      // a first-time user about the Studio (and, outside beta, the
      // hardcover keepsake CTA). SlideReader reads + dismisses it
      // entirely in component state — no localStorage.
      router.push(`/read/${state.result.storyId}?fresh=1`);
    } else if (state.kind === "failed") {
      setError(state.error);
      setGenerating(false);
      setGeneratingProgress(null);
    } else if (state.kind === "stalled") {
      // Wall-clock budget exhausted but Inngest keeps running. Surface
      // an info message instead of treating it as a failure — the
      // story will land in the dashboard when it finishes.
      setError(
        "Your story is taking longer than expected. It'll appear on your home page when it's ready — feel free to leave this tab."
      );
      setGenerating(false);
      setGeneratingProgress(null);
    } else if (state.kind === "running" && state.result) {
      const r = state.result as Partial<{ current: number; total: number }>;
      if (typeof r.current === "number" && typeof r.total === "number") {
        setGeneratingProgress({ current: r.current, total: r.total });
      }
    }
  }, [state, router]);

  function handleTemplateSelect(template: StoryTemplate) {
    setSelectedTemplate(template);
    setKind(template.kind);
    setPrompt(template.starterPrompt ?? "");
    setError("");
  }

  function handleBackToTemplates() {
    setSelectedTemplate(null);
    setPrompt("");
    setKind("pet");
    setError("");
  }

  function applyStarter(id: string) {
    if (!selectedPet) return;
    const s = starters.find((x) => x.id === id);
    if (!s) return;
    setPrompt(s.build(selectedPet));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    if (kind === "pet" && !petId) return;
    // First-time gate: if there's no stored consent yet, open the
    // modal and park the submission. `runGenerate` is called from the
    // modal's onAccept callback. Reading at submit time (not on mount)
    // avoids a setState-in-effect lint complaint and an extra render.
    if (readStoredConsent() === null) {
      setConsentModalOpen(true);
      return;
    }
    await runGenerate();
  }

  async function runGenerate() {
    setGenerating(true);
    setGeneratingProgress(null);
    setError("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          pageCount,
          kind,
          petId: kind === "pet" ? petId : null,
          imageMode,
          imageStyle,
          isPublic: false,
        }),
      });
      if (!res.ok && res.status !== 202) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Generation failed");
      }
      const { jobId } = (await res.json()) as { jobId: string };
      start(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setGenerating(false);
    }
  }

  const ready =
    !!prompt.trim() && (kind === "generic" || (kind === "pet" && !!petId));

  return (
    <>
      {generating && <GeneratingOverlay progress={generatingProgress} />}
      <LegalConsentModal
        open={consentModalOpen}
        onAccept={() => {
          setConsentModalOpen(false);
          // Resume the submission the user originally triggered. The
          // modal has already persisted the consent record so the
          // next submit won't re-prompt.
          void runGenerate();
        }}
        onCancel={() => setConsentModalOpen(false)}
      />

      {!isDesktop && !mobileNoticeDismissed && (
        <div className="mx-auto mb-4 flex w-full max-w-xl items-start gap-3 rounded-2xl border border-cream-300 bg-cream-50 px-4 py-3 text-xs leading-5 text-ink-700 shadow-[0_1px_2px_rgba(14,26,43,0.04)]">
          <span aria-hidden="true" className="mt-0.5 text-moss-700">
            ⓘ
          </span>
          <span className="flex-1">
            You can create and read stories on your phone. The page
            editor (Studio) needs a tablet or desktop.
          </span>
          <button
            type="button"
            onClick={() => setMobileNoticeDismissed(true)}
            aria-label="Dismiss"
            className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-ink-500 hover:bg-cream-100 hover:text-ink-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Step 1: template chooser. Shown until the user picks a template. */}
      {!selectedTemplate && (
        <TemplateChooserPanel onSelect={handleTemplateSelect} />
      )}

      {/* Step 2: creation form, shown after a template is chosen. */}
      {selectedTemplate && (
        <form onSubmit={handleSubmit} className="w-full space-y-6">
          {/* Template header + back link */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBackToTemplates}
              className="flex items-center gap-1 rounded-full border border-cream-300 bg-cream-50 px-3 py-1.5 text-xs font-medium text-ink-500 transition-colors hover:border-cream-400 hover:text-ink-900"
            >
              ← All templates
            </button>
            <span className="text-sm font-medium text-ink-700">
              {selectedTemplate.emoji} {selectedTemplate.label}
            </span>
          </div>

          {kind === "pet" && (
            <>
              <PetPicker
                pets={pets}
                selectedId={petId}
                onSelect={setPetId}
              />
              {pets.length === 0 && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleBackToTemplates}
                    className="text-xs font-medium text-ink-500 underline decoration-cream-400 underline-offset-2 transition-colors hover:text-moss-700 hover:decoration-moss-300"
                  >
                    Choose a different template →
                  </button>
                </div>
              )}
            </>
          )}

          {kind === "pet" && selectedPet && (
            <StarterPicker starters={starters} onPick={applyStarter} />
          )}

          {/* Prompt + page count */}
          <div className="overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-[0_1px_2px_rgba(14,26,43,0.04)] transition focus-within:border-moss-700 focus-within:ring-4 focus-within:ring-moss-100/60">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                kind === "pet" && selectedPet
                  ? `What should ${selectedPet.name}'s story be about?`
                  : selectedTemplate.promptPlaceholder
              }
              rows={4}
              maxLength={1000}
              className="w-full resize-none bg-transparent px-5 py-4 text-base leading-relaxed text-ink-900 placeholder-ink-300 focus:outline-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cream-200 bg-cream-100/60 px-5 py-3">
              <span className="text-xs text-ink-300">
                {prompt.length} / 1000
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-ink-500">Pages</span>
                <div className="flex flex-wrap items-center gap-1">
                  {PAGE_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setPageCount(n);
                        setCustomMode(false);
                      }}
                      title={
                        n < PRINT_MIN_PAGES
                          ? `${n} pages — digital only (hardcover needs at least ${PRINT_MIN_PAGES})`
                          : `${n} pages`
                      }
                      className={`h-8 min-w-[2.25rem] rounded-lg px-2 text-sm font-medium transition-colors ${
                        !customMode && pageCount === n
                          ? "bg-ink-900 text-cream-50"
                          : "bg-cream-50 text-ink-500 hover:bg-cream-200 hover:text-ink-900"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  {customMode ? (
                    <input
                      type="number"
                      min={MIN_PAGES}
                      max={MAX_PAGES}
                      step={1}
                      value={pageCount}
                      onChange={(e) => {
                        const raw = parseInt(e.target.value, 10);
                        if (Number.isNaN(raw)) return;
                        setPageCount(
                          Math.max(MIN_PAGES, Math.min(MAX_PAGES, raw))
                        );
                      }}
                      onBlur={() => {
                        // Snap back to a preset if the user typed one.
                        if (PAGE_OPTIONS.includes(pageCount)) {
                          setCustomMode(false);
                        }
                      }}
                      className="h-8 w-20 rounded-lg border border-ink-900 bg-cream-50 px-2 text-sm font-medium text-ink-900 focus:outline-none focus:ring-2 focus:ring-moss-100"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomMode(true);
                        // Seed with current value so the input shows it.
                        if (!PAGE_OPTIONS.includes(pageCount)) return;
                      }}
                      className="h-8 rounded-lg bg-cream-50 px-3 text-xs font-medium text-ink-500 hover:bg-cream-200 hover:text-ink-900"
                    >
                      Custom
                    </button>
                  )}
                </div>
              </div>
            </div>
            {pageCount < PRINT_MIN_PAGES && (
              <div className="flex items-start gap-2 border-t border-cream-200 bg-amber-50/60 px-5 py-2 text-[11px] font-medium text-amber-900">
                <span aria-hidden="true">ⓘ</span>
                <span>
                  Stories under {PRINT_MIN_PAGES} pages can be read online or
                  downloaded as a PDF, but can&rsquo;t be ordered as a
                  hardcover.
                </span>
              </div>
            )}
            {pageCount >= PRINT_MIN_PAGES && pageCount % 4 !== 0 && (
              <div className="flex items-start gap-2 border-t border-cream-200 bg-amber-50/60 px-5 py-2 text-[11px] font-medium text-amber-900">
                <span aria-hidden="true">ⓘ</span>
                <span>
                  Printed books are bound in signatures of 4 pages — picking a
                  count not divisible by 4 adds 1&ndash;3 blank pages at the
                  back. Pick a multiple of 4 (24, 28, 32, 36, &hellip;) to
                  avoid this.
                </span>
              </div>
            )}
          </div>

          <StylePicker value={imageStyle} onChange={setImageStyle} />

          {kind === "pet" && (
            <ImageModePicker mode={imageMode} onChange={setImageMode} />
          )}

          <div className="flex flex-col items-center gap-3">
            <button
              type="submit"
              disabled={!ready || generating}
              className="rounded-full bg-moss-700 px-8 py-3 text-base font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-moss-700"
            >
              Create my story
            </button>

            {/* Pricing disclosure below the CTA. Hidden entirely during
                closed beta — reading is auto-unlocked and hardcover is
                paused, so quoting either price would be misleading. */}
            {!betaOn && (
              <p className="text-center text-xs text-ink-500">
                Read online or download for $9.99. Hardcover keepsakes from
                $34.99.
              </p>
            )}

            {error && (
              <p className="text-center text-sm text-rose-600">{error}</p>
            )}
          </div>
        </form>
      )}
    </>
  );
}

function PetPicker({
  pets,
  selectedId,
  onSelect,
}: {
  pets: Pet[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (pets.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-cream-300 bg-cream-50 px-4 sm:px-6 lg:px-8 py-8 text-center">
        <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink-900">
          Add a pet to get started
        </p>
        <p className="max-w-sm text-sm text-ink-500">
          Pet photos are what let the AI keep your pet looking like your pet
          across every page.
        </p>
        <Link
          href="/pets/new"
          className="rounded-full bg-moss-700 px-5 py-2 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
        >
          Add a pet
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {pets.map((p) => {
        const active = selectedId === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className={`flex items-center gap-2.5 rounded-full border px-2.5 py-1.5 transition-colors ${
              active
                ? "border-ink-900 bg-ink-900 text-cream-50"
                : "border-cream-300 bg-cream-50 text-ink-700 hover:border-cream-400 hover:bg-cream-100"
            }`}
          >
            <PetAvatar pet={p} size={28} />
            <span className="pr-1 text-sm font-medium">{p.name}</span>
            {p.mode === "memorial" && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] ${
                  active
                    ? "bg-cream-50/15 text-cream-50"
                    : "bg-gold-100 text-gold-900"
                }`}
              >
                In memory
              </span>
            )}
          </button>
        );
      })}
      <Link
        href="/pets/new"
        className="rounded-full border border-dashed border-cream-400 bg-cream-50 px-3 py-1.5 text-xs font-medium text-ink-500 hover:border-moss-500 hover:text-ink-900"
      >
        + Add pet
      </Link>
    </div>
  );
}

function StarterPicker({
  starters,
  onPick,
}: {
  starters: ReturnType<typeof startersForMode>;
  onPick: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-center text-xs font-medium text-ink-500">
        Or pick a starter
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {starters.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            className="group rounded-xl border border-cream-300 bg-cream-50 px-3 py-3 text-center text-sm font-medium text-ink-700 transition-all hover:-translate-y-0.5 hover:border-gold-500 hover:shadow-sm"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StylePicker({
  value,
  onChange,
}: {
  value: ImageStyleId;
  onChange: (v: ImageStyleId) => void;
}) {
  const selected = IMAGE_STYLES.find((s) => s.id === value) ?? IMAGE_STYLES[0];
  return (
    <div className="rounded-2xl border border-cream-300 bg-cream-50 px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-medium text-ink-500">Art style</span>
        <span className="text-xs text-ink-300">{selected.blurb}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {IMAGE_STYLES.map((s) => {
          const active = s.id === value;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(s.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-ink-900 bg-ink-900 text-cream-50"
                  : "border-cream-300 bg-cream-50 text-ink-700 hover:border-cream-400 hover:bg-cream-100"
              }`}
            >
              {s.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ImageModePicker({
  mode,
  onChange,
}: {
  mode: "fast" | "quality";
  onChange: (m: "fast" | "quality") => void;
}) {
  return (
    <div className="rounded-2xl border border-cream-300 bg-cream-50 px-4 py-3">
      <div className="mb-2 text-xs font-medium text-ink-500">
        Image generation
      </div>
      <div className="flex rounded-lg bg-cream-200 p-1">
        <button
          type="button"
          onClick={() => onChange("quality")}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "quality"
              ? "bg-cream-50 text-ink-900 shadow-sm"
              : "text-ink-500 hover:text-ink-900"
          }`}
        >
          Quality (slower, consistent)
        </button>
        <button
          type="button"
          onClick={() => onChange("fast")}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "fast"
              ? "bg-cream-50 text-ink-900 shadow-sm"
              : "text-ink-500 hover:text-ink-900"
          }`}
        >
          Fast (parallel)
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-ink-500">
        {mode === "quality"
          ? "Each page anchors to page 1 + the previous page so the character stays identical. ~3–4 minutes for a 10-page book."
          : "All pages render in parallel using your pet's reference photos. ~30 seconds for a 10-page book."}
      </p>
    </div>
  );
}

// Grid of template cards shown as step 1 of the creation flow. Lets
// users declare their intent before the form appears, replacing the
// pet-only empty state with a broad set of story occasions.
function TemplateChooserPanel({
  onSelect,
}: {
  onSelect: (t: StoryTemplate) => void;
}) {
  return (
    <div className="w-full space-y-4">
      <p className="text-center text-sm font-medium text-ink-500">
        What kind of story would you like to make?
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STORY_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t)}
            className="group flex flex-col items-start gap-2 rounded-2xl border border-cream-300 bg-cream-50 px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-moss-500 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-moss-500"
          >
            <span className="text-2xl leading-none" aria-hidden="true">
              {t.emoji}
            </span>
            <span className="text-sm font-semibold text-ink-900">
              {t.label}
            </span>
            <span className="text-xs leading-relaxed text-ink-500">
              {t.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
