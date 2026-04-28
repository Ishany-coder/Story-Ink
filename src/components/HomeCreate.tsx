"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import GeneratingOverlay from "./GeneratingOverlay";
import PetAvatar from "./PetAvatar";
import { useJobPolling } from "@/lib/useJobPolling";
import { startersForMode } from "@/lib/story-starters";
import type { Pet } from "@/lib/types";

const PAGE_OPTIONS = [3, 5, 7, 10, 12];

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
  const [kind, setKind] = useState<"pet" | "generic">(
    pets.length > 0 ? "pet" : "generic"
  );
  const [petId, setPetId] = useState<string | null>(pets[0]?.id ?? null);
  const [prompt, setPrompt] = useState("");
  const [pageCount, setPageCount] = useState(5);
  const [imageMode, setImageMode] = useState<"fast" | "quality">("quality");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [generatingProgress, setGeneratingProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

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
      router.push(`/read/${state.result.storyId}`);
    } else if (state.kind === "failed") {
      setError(state.error);
      setGenerating(false);
      setGeneratingProgress(null);
    } else if (state.kind === "running" && state.result) {
      const r = state.result as Partial<{ current: number; total: number }>;
      if (typeof r.current === "number" && typeof r.total === "number") {
        setGeneratingProgress({ current: r.current, total: r.total });
      }
    }
  }, [state, router]);

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

      <form onSubmit={handleSubmit} className="w-full space-y-6">
        {/* Mode toggle */}
        <div className="mx-auto flex w-fit rounded-full border border-stone-300 bg-white p-1">
          <ModeToggleButton
            active={kind === "pet"}
            onClick={() => {
              if (pets.length === 0) {
                router.push("/pets/new");
              } else {
                setKind("pet");
              }
            }}
            label="Pet story"
          />
          <ModeToggleButton
            active={kind === "generic"}
            onClick={() => setKind("generic")}
            label="Generic story"
          />
        </div>

        {kind === "pet" && (
          <PetPicker
            pets={pets}
            selectedId={petId}
            onSelect={setPetId}
          />
        )}

        {kind === "pet" && selectedPet && (
          <StarterPicker starters={starters} onPick={applyStarter} />
        )}

        {/* Prompt + page count */}
        <div className="overflow-hidden rounded-2xl border border-stone-300 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] focus-within:border-purple-400 focus-within:ring-4 focus-within:ring-purple-100 transition">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              kind === "pet" && selectedPet
                ? `What should ${selectedPet.name}'s story be about?`
                : "Describe the story you'd like to make…"
            }
            rows={4}
            maxLength={1000}
            className="w-full resize-none bg-transparent px-5 py-4 text-base leading-relaxed text-slate-900 placeholder-slate-400 focus:outline-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-stone-50/60 px-5 py-3">
            <span className="text-xs text-slate-400">
              {prompt.length} / 1000
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Pages</span>
              <div className="flex gap-1">
                {PAGE_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPageCount(n)}
                    className={`h-8 w-8 rounded-lg text-sm font-medium transition-colors ${
                      pageCount === n
                        ? "bg-slate-900 text-white"
                        : "bg-white text-slate-500 hover:bg-stone-200/70 hover:text-slate-900"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {kind === "pet" && (
          <ImageModePicker mode={imageMode} onChange={setImageMode} />
        )}

        <div className="flex flex-col items-center gap-3">
          <button
            type="submit"
            disabled={!ready || generating}
            className="rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-8 py-3 text-base font-semibold text-white shadow-md shadow-purple-200/40 transition-[filter,transform] hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
          >
            Create my story
          </button>

          {error && (
            <p className="text-center text-sm text-rose-600">{error}</p>
          )}
        </div>
      </form>
    </>
  );
}

function ModeToggleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-slate-900 text-white"
          : "text-slate-500 hover:text-slate-900"
      }`}
    >
      {label}
    </button>
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
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-stone-300 bg-white px-6 py-8 text-center">
        <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">
          Add a pet to get started
        </p>
        <p className="max-w-sm text-sm text-slate-500">
          Pet photos are what let the AI keep your pet looking like your pet
          across every page.
        </p>
        <Link
          href="/pets/new"
          className="rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-[filter] hover:brightness-110"
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
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-stone-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-stone-50"
            }`}
          >
            <PetAvatar pet={p} size={28} />
            <span className="pr-1 text-sm font-medium">{p.name}</span>
            {p.mode === "memorial" && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                  active
                    ? "bg-white/20 text-white"
                    : "bg-purple-100 text-purple-700"
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
        className="rounded-full border border-dashed border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700"
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
      <div className="mb-2 text-center text-xs font-medium text-slate-500">
        Or pick a starter
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {starters.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            className="group rounded-xl border border-stone-200 bg-white px-3 py-3 text-center text-sm font-medium text-slate-700 transition-all hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-sm"
          >
            {s.label}
          </button>
        ))}
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
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <div className="mb-2 text-xs font-medium text-slate-500">
        Image generation
      </div>
      <div className="flex rounded-lg bg-stone-100 p-1">
        <button
          type="button"
          onClick={() => onChange("quality")}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "quality"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          Quality (slower, consistent)
        </button>
        <button
          type="button"
          onClick={() => onChange("fast")}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "fast"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          Fast (parallel)
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-500">
        {mode === "quality"
          ? "Each page uses the previous one as visual reference. ~3–4 minutes for a 10-page book."
          : "All pages render in parallel using your pet's reference photos. ~30 seconds for a 10-page book."}
      </p>
    </div>
  );
}
