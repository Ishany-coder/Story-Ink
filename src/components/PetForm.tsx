"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PET_SPECIES,
  type Pet,
  type PetMode,
  type PetQuirk,
  type PetSpecies,
} from "@/lib/types";
import { QUIRK_BANK, QUIRK_CATEGORIES } from "@/lib/quirk-bank";

const MAX_PHOTOS = 10;

interface Props {
  // null → create mode; a Pet → edit mode (prefilled fields).
  initial?: Pet | null;
}

// Single form used by /pets/new and /pets/[id]. Visual language matches
// the rest of the redesigned site: white surface, soft stone borders,
// purple accent only on the focus ring + primary CTA.
export default function PetForm({ initial = null }: Props) {
  const router = useRouter();
  const editing = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [species, setSpecies] = useState<PetSpecies>(
    initial?.species ?? "dog"
  );
  const [breed, setBreed] = useState(initial?.breed ?? "");
  const [age, setAge] = useState(initial?.age ?? "");
  const [notes, setNotes] = useState(initial?.personality_notes ?? "");
  const [mode, setMode] = useState<PetMode>(initial?.mode ?? "living");
  const [passedAt, setPassedAt] = useState(initial?.passed_at ?? "");
  const [dedication, setDedication] = useState(initial?.dedication_text ?? "");
  const [isPublic, setIsPublic] = useState(initial?.is_public ?? false);
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? []);
  // Quirk answers stored as a Map<id, answer> for O(1) updates. We
  // serialize back to an array of {id, answer} on submit, dropping
  // empty answers so we don't persist filler.
  const [quirkAnswers, setQuirkAnswers] = useState<Record<string, string>>(
    () => {
      const seed: Record<string, string> = {};
      for (const q of initial?.quirks ?? []) seed[q.id] = q.answer;
      return seed;
    }
  );

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Group quirks by category for the form UI.
  const groupedQuirks = useMemo(() => {
    const out: Record<string, typeof QUIRK_BANK> = {};
    for (const q of QUIRK_BANK) {
      (out[q.category] ??= []).push(q);
    }
    return out;
  }, []);

  const filledQuirkCount = Object.values(quirkAnswers).filter((a) =>
    a.trim()
  ).length;

  async function uploadPhoto(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Upload failed");
    }
    const { url } = (await res.json()) as { url: string };
    return url;
  }

  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const room = MAX_PHOTOS - photos.length;
      const files = Array.from(fileList).slice(0, room);
      const uploaded: string[] = [];
      for (const f of files) {
        uploaded.push(await uploadPhoto(f));
      }
      setPhotos((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function removePhoto(url: string) {
    setPhotos((prev) => prev.filter((p) => p !== url));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give your pet a name.");
      return;
    }
    if (mode === "memorial" && !/^\d{4}-\d{2}-\d{2}$/.test(passedAt)) {
      setError("Please enter the date your pet passed (YYYY-MM-DD).");
      return;
    }
    setPending(true);
    setError(null);

    const quirks: PetQuirk[] = Object.entries(quirkAnswers)
      .map(([id, answer]) => ({ id, answer: answer.trim() }))
      .filter((q) => q.answer.length > 0);

    const body = {
      name: name.trim(),
      species,
      breed: breed.trim() || null,
      age: age.trim() || null,
      personality_notes: notes.trim() || null,
      mode,
      passed_at: mode === "memorial" ? passedAt : null,
      dedication_text:
        mode === "memorial" && dedication.trim() ? dedication.trim() : null,
      photos,
      quirks,
      is_public: isPublic,
    };

    try {
      const url = editing ? `/api/pets/${initial!.id}` : "/api/pets";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Save failed");
      }
      router.push("/pets");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    if (
      !confirm(
        `Delete ${initial!.name}? This won't delete any stories you've already made.`
      )
    ) {
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/pets/${initial!.id}`, { method: "DELETE" });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Delete failed");
      }
      router.push("/pets");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-rise-in mx-auto max-w-2xl space-y-6 px-6 py-10"
    >
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-slate-900">
        {editing ? `Edit ${initial!.name}` : "Add a pet"}
      </h1>

      <Field label="Name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
          className={inputCls}
        />
      </Field>

      <Field label="Species">
        <select
          value={species}
          onChange={(e) => setSpecies(e.target.value as PetSpecies)}
          className={inputCls}
        >
          {PET_SPECIES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Breed (optional)">
          <input
            type="text"
            value={breed ?? ""}
            onChange={(e) => setBreed(e.target.value)}
            maxLength={80}
            className={inputCls}
          />
        </Field>
        <Field label="Age (optional)">
          <input
            type="text"
            value={age ?? ""}
            onChange={(e) => setAge(e.target.value)}
            maxLength={40}
            placeholder="e.g. 7 years"
            className={inputCls}
          />
        </Field>
      </div>

      <Field
        label="Personality (free-form, optional)"
        hint="Write naturally. 'Loves the mailman, scared of the vacuum, sleeps on my pillow.'"
      >
        <textarea
          value={notes ?? ""}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
          rows={3}
          className={`${inputCls} resize-none`}
        />
      </Field>

      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">
              Personality DNA
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Specific quirks make stories feel like your pet, not a generic
              one. Skip whatever doesn&rsquo;t apply.
            </p>
          </div>
          <span className="text-xs text-slate-400">
            {filledQuirkCount} answered
          </span>
        </div>

        <div className="space-y-5">
          {QUIRK_CATEGORIES.map((cat) => {
            const prompts = groupedQuirks[cat.id] ?? [];
            if (prompts.length === 0) return null;
            return (
              <div key={cat.id}>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  {cat.label}
                </div>
                <div className="space-y-2">
                  {prompts.map((p) => (
                    <div key={p.id}>
                      <label className="mb-1 block text-xs font-medium text-slate-700">
                        {p.prompt}
                      </label>
                      <input
                        type="text"
                        value={quirkAnswers[p.id] ?? ""}
                        onChange={(e) =>
                          setQuirkAnswers((prev) => ({
                            ...prev,
                            [p.id]: e.target.value,
                          }))
                        }
                        maxLength={400}
                        placeholder={p.placeholder}
                        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-purple-400 focus:outline-none focus:ring-4 focus:ring-purple-100"
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <Field label="Mode">
        <div className="flex rounded-full border border-stone-300 bg-white p-1">
          <ModeButton
            value="living"
            current={mode}
            onClick={() => setMode("living")}
            label="Living"
          />
          <ModeButton
            value="memorial"
            current={mode}
            onClick={() => setMode("memorial")}
            label="In memory"
          />
        </div>
      </Field>

      {mode === "memorial" && (
        <>
          <Field
            label="Passed away on"
            hint="Used for the memorial dedication page on printed books."
          >
            <input
              type="date"
              value={passedAt ?? ""}
              onChange={(e) => setPassedAt(e.target.value)}
              required
              className={inputCls}
            />
          </Field>
          <Field
            label="Dedication text (optional)"
            hint='Leave blank to use the default: "In loving memory of [name], [dates]". Anything you write here replaces the default on both the front and back of the printed book.'
          >
            <textarea
              value={dedication ?? ""}
              onChange={(e) => setDedication(e.target.value)}
              maxLength={600}
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </Field>
        </>
      )}

      <Field
        label={`Reference photos (${photos.length}/${MAX_PHOTOS})`}
        hint="The AI uses these on every page so the pet looks like the pet. 3–5 clear photos in different poses works best."
      >
        <div className="space-y-3">
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {photos.map((url) => (
                <div
                  key={url}
                  className="relative aspect-square overflow-hidden rounded-xl border border-stone-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="reference"
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(url)}
                    className="absolute right-1 top-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-medium text-rose-600 shadow-sm transition-colors hover:bg-rose-500 hover:text-white"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          {photos.length < MAX_PHOTOS && (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-6 text-sm font-medium text-slate-500 transition-colors hover:border-slate-400 hover:bg-stone-50">
              {uploading ? "Uploading…" : "+ Upload photos"}
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={uploading}
                onChange={handlePhotoPick}
                className="hidden"
              />
            </label>
          )}
        </div>
      </Field>

      <Field label="Visibility">
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 transition-colors hover:border-stone-300">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="h-4 w-4 accent-purple-600"
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-900">
              Make this pet&rsquo;s profile public
            </div>
            <div className="text-xs text-slate-500">
              Off by default. Public stories about this pet are still
              controlled per-story.
            </div>
          </div>
        </label>
      </Field>

      {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="submit"
          disabled={pending || uploading}
          className="rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-[filter] hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Saving…" : editing ? "Save changes" : "Add pet"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="rounded-full border border-rose-200 bg-white px-4 py-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
          >
            Delete pet
          </button>
        )}
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-base text-slate-900 placeholder-slate-400 transition focus:border-purple-400 focus:outline-none focus:ring-4 focus:ring-purple-100";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-slate-700">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </label>
  );
}

function ModeButton({
  value,
  current,
  onClick,
  label,
}: {
  value: PetMode;
  current: PetMode;
  onClick: () => void;
  label: string;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-slate-900 text-white"
          : "text-slate-500 hover:text-slate-900"
      }`}
    >
      {label}
    </button>
  );
}
