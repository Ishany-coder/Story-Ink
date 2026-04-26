"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import GeneratingOverlay from "./GeneratingOverlay";
import { useJobPolling } from "@/lib/useJobPolling";
import { startersForMode } from "@/lib/story-starters";
import type { Pet } from "@/lib/types";

const PAGE_OPTIONS = [3, 5, 7, 10, 12];

interface Props {
  pets: Pet[];
}

// The home-page create flow. Two distinct surfaces:
//
//   - "Pet" mode (the default when the user has at least one pet):
//     pick a pet → pick a starter card → optionally edit the prompt →
//     pick a length and image-quality mode → generate. The prompt
//     starts blank but the picked starter writes a templated prompt
//     into the textarea so the user can tweak before submitting.
//
//   - "Generic" mode (the original freeform path, kept on per the
//     "pet-friendly toggle" decision in question 1B): just a
//     textarea + page count.
//
// The Fast/Quality image toggle determines whether each page's image
// gets the previous page's image as visual context (Quality, slower
// but consistent) or only the pet's reference photos (Fast, parallel).

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
      // Inngest functions write progress (current page number) into
      // jobs.result while running. We ignore parse errors here — if
      // the structure isn't what we expect the spinner just doesn't
      // show a count.
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
        {/* Mode toggle: pet stories vs. generic. Always visible so the
            user can flip even when they have pets, per the design
            answer for question 1B. */}
        <div className="mx-auto flex w-fit rounded-full border-2 border-purple-200 bg-purple-50/60 p-1">
          <ModeToggleButton
            active={kind === "pet"}
            onClick={() => setKind("pet")}
            label={
              pets.length === 0
                ? "Pet story (add a pet first)"
                : "Pet story"
            }
            disabled={pets.length === 0}
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

        <div className="rounded-3xl bg-gradient-to-r from-purple-400 via-pink-400 to-orange-300 p-[3px] shadow-lg shadow-purple-200/50">
          <div className="rounded-3xl bg-white">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                kind === "pet" && selectedPet
                  ? `A story about ${selectedPet.name}...`
                  : "A tiny dragon who loves to bake cupcakes..."
              }
              rows={4}
              maxLength={1000}
              className="w-full resize-none rounded-3xl bg-transparent px-6 py-5 text-lg text-purple-900 placeholder-purple-300 focus:outline-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-dashed border-purple-100 px-6 py-3">
              <span className="text-xs font-bold text-purple-300">
                {prompt.length}/1000
              </span>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-purple-500">Pages:</span>
                <div className="flex gap-1.5">
                  {PAGE_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPageCount(n)}
                      className={`h-9 w-9 rounded-xl text-sm font-black transition-all ${
                        pageCount === n
                          ? "scale-110 bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-md shadow-purple-300"
                          : "bg-purple-50 text-purple-400 hover:scale-105 hover:bg-purple-100"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Image quality vs. speed — only meaningful for pet stories
            (where reference photos are passed). For generic stories
            both modes generate in parallel anyway, so we hide it. */}
        {kind === "pet" && (
          <ImageModePicker mode={imageMode} onChange={setImageMode} />
        )}

        <div className="flex justify-center">
          <button
            type="submit"
            disabled={!ready || generating}
            className="group flex h-16 items-center gap-3 rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-10 text-xl font-black text-white shadow-xl shadow-purple-300/40 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-pink-300/50 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
          >
            <span className="text-2xl transition-transform group-hover:rotate-12">
              &#9997;&#65039;
            </span>
            Create my story!
          </button>
        </div>

        {error && (
          <p className="text-center text-sm font-bold text-red-400">
            Oops! {error}
          </p>
        )}
      </form>
    </>
  );
}

function ModeToggleButton({
  active,
  onClick,
  label,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-5 py-2 text-sm font-black transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "bg-white text-purple-600 shadow-sm"
          : "text-purple-400 hover:text-purple-500"
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
      <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-purple-200 bg-white px-6 py-10 text-center">
        <div className="text-5xl">&#129420;</div>
        <p className="text-base font-bold text-purple-600">
          Add a pet to make stories about them.
        </p>
        <Link
          href="/pets/new"
          className="rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-5 py-2 text-sm font-black text-white shadow-md shadow-purple-200"
        >
          + Add a pet
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {pets.map((p) => {
        const cover = p.photos[0] ?? null;
        const active = selectedId === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className={`flex items-center gap-3 rounded-2xl border-2 px-3 py-2 transition-all ${
              active
                ? "border-purple-400 bg-white shadow-md shadow-purple-200"
                : "border-purple-100 bg-white/80 hover:border-purple-300"
            }`}
          >
            <div className="h-10 w-10 overflow-hidden rounded-full bg-purple-100">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cover}
                  alt={p.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-lg">
                  &#128062;
                </span>
              )}
            </div>
            <div className="text-left">
              <div className="text-sm font-black text-purple-700">{p.name}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                {p.species}
                {p.mode === "memorial" ? " · in memory" : ""}
              </div>
            </div>
          </button>
        );
      })}
      <Link
        href="/pets/new"
        className="rounded-2xl border-2 border-dashed border-purple-300 bg-purple-50/60 px-4 py-3 text-xs font-black uppercase tracking-wider text-purple-500 hover:border-purple-400 hover:bg-purple-100"
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
      <div className="mb-2 text-center text-[11px] font-black uppercase tracking-wider text-purple-400">
        Or pick a starter
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {starters.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            className="group flex flex-col items-center gap-1 rounded-2xl border-2 border-purple-100 bg-white px-3 py-3 text-center transition-all hover:-translate-y-0.5 hover:border-purple-300 hover:shadow-sm"
          >
            <span className="text-2xl">{s.emoji}</span>
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-500">
              {s.label}
            </span>
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
    <div className="rounded-2xl border-2 border-purple-100 bg-white px-4 py-3">
      <div className="mb-2 text-center text-[11px] font-black uppercase tracking-wider text-purple-400">
        Image generation
      </div>
      <div className="flex rounded-xl bg-purple-50/60 p-1">
        <button
          type="button"
          onClick={() => onChange("quality")}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wider transition-all ${
            mode === "quality"
              ? "bg-white text-purple-600 shadow-sm"
              : "text-purple-400"
          }`}
        >
          Quality (slower, consistent)
        </button>
        <button
          type="button"
          onClick={() => onChange("fast")}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wider transition-all ${
            mode === "fast"
              ? "bg-white text-purple-600 shadow-sm"
              : "text-purple-400"
          }`}
        >
          Fast (parallel)
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] font-semibold text-purple-400">
        {mode === "quality"
          ? "Each page uses the previous one as visual reference. ~3–4 minutes for a 10-page book."
          : "All pages render in parallel using your pet's reference photos. ~30 seconds for a 10-page book."}
      </p>
    </div>
  );
}
