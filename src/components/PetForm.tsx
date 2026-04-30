"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PET_SPECIES,
  type Pet,
  type PetMode,
  type PetQuirk,
  type PetSpecies,
} from "@/lib/types";
import { QUIRK_BANK } from "@/lib/quirk-bank";

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
  // Quirk rows. Default 5 from QUIRK_BANK pre-populated with empty
  // answers; the user fills any subset. Editing a pet seeds with their
  // saved quirks first, then appends any unfilled bank rows so the
  // user can keep adding to existing pets without losing context.
  //
  // Custom rows have an editable prompt field. Bank rows have their
  // prompt locked but still saved verbatim — that way changing the
  // bank's wording later doesn't invalidate persisted answers.
  interface QuirkRow {
    prompt: string;
    answer: string;
    // True when the prompt was supplied by the bank (locked); false
    // when the user added it themselves via "+ Add custom quirk."
    fromBank: boolean;
  }

  const [quirkRows, setQuirkRows] = useState<QuirkRow[]>(() => {
    const saved: QuirkRow[] = (initial?.quirks ?? []).map((q) => ({
      prompt: q.prompt,
      answer: q.answer,
      // Treat any saved row whose prompt matches the current bank as
      // a "bank" row (prompt locked); user-edited prompts become
      // custom rows.
      fromBank: QUIRK_BANK.some((b) => b.prompt === q.prompt),
    }));
    const usedPrompts = new Set(saved.map((r) => r.prompt));
    const banked: QuirkRow[] = QUIRK_BANK.filter(
      (b) => !usedPrompts.has(b.prompt)
    ).map((b) => ({
      prompt: b.prompt,
      answer: "",
      fromBank: true,
    }));
    return [...saved, ...banked];
  });

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const filledQuirkCount = quirkRows.filter((r) => r.answer.trim()).length;

  function updateQuirk(idx: number, patch: Partial<QuirkRow>) {
    setQuirkRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    );
  }
  function addCustomQuirk() {
    setQuirkRows((prev) => [
      ...prev,
      { prompt: "", answer: "", fromBank: false },
    ]);
  }
  function removeCustomQuirk(idx: number) {
    setQuirkRows((prev) => prev.filter((_, i) => i !== idx));
  }

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

    const quirks: PetQuirk[] = quirkRows
      .map((r) => ({ prompt: r.prompt.trim(), answer: r.answer.trim() }))
      .filter((q) => q.prompt.length > 0 && q.answer.length > 0);

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
      className="animate-rise-in mx-auto max-w-2xl space-y-6 px-4 sm:px-6 lg:px-8 py-10"
    >
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-ink-900">
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

      <section className="rounded-2xl border border-cream-300 bg-cream-50 p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink-900">
              Personality DNA
            </h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Specific traits make stories feel like your pet. Five
              questions to start; add your own for the things only your
              pet does.
            </p>
          </div>
          <span className="text-xs text-ink-300">
            {filledQuirkCount} answered
          </span>
        </div>

        <div className="space-y-3">
          {quirkRows.map((row, idx) => (
            <div key={idx} className="space-y-1">
              {row.fromBank ? (
                <label className="block text-xs font-medium text-ink-700">
                  {row.prompt}
                </label>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={row.prompt}
                    onChange={(e) =>
                      updateQuirk(idx, { prompt: e.target.value })
                    }
                    maxLength={200}
                    placeholder="Your own question (e.g. How does she greet you?)"
                    className="w-full rounded-lg border border-cream-300 bg-cream-50 px-3 py-1.5 text-xs font-medium text-ink-700 placeholder-ink-300 transition focus:border-moss-700 focus:outline-none focus:ring-4 focus:ring-moss-100/60"
                  />
                  <button
                    type="button"
                    onClick={() => removeCustomQuirk(idx)}
                    aria-label="Remove this question"
                    className="shrink-0 rounded-lg border border-cream-300 bg-cream-50 px-2 py-1 text-[10px] font-medium text-ink-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                  >
                    Remove
                  </button>
                </div>
              )}
              <input
                type="text"
                value={row.answer}
                onChange={(e) => updateQuirk(idx, { answer: e.target.value })}
                maxLength={400}
                placeholder={
                  row.fromBank
                    ? QUIRK_BANK.find((b) => b.prompt === row.prompt)
                        ?.placeholder ?? "Your answer"
                    : "Your answer"
                }
                className="w-full rounded-lg border border-cream-300 bg-cream-50 px-3 py-1.5 text-sm text-ink-900 placeholder-ink-300 transition focus:border-moss-700 focus:outline-none focus:ring-4 focus:ring-moss-100/60"
              />
            </div>
          ))}

          <button
            type="button"
            onClick={addCustomQuirk}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-cream-400 bg-cream-50 px-3 py-2 text-xs font-medium text-ink-500 transition-colors hover:border-moss-500 hover:text-ink-900"
          >
            <span aria-hidden="true" className="text-base leading-none">
              +
            </span>
            Add a custom question
          </button>
        </div>
      </section>

      <Field label="Mode">
        <div className="flex rounded-full border border-cream-300 bg-cream-50 p-1">
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
                  className="relative aspect-square overflow-hidden rounded-xl border border-cream-300"
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
                    className="absolute right-1 top-1 rounded-full bg-cream-50/95 px-2 py-0.5 text-[10px] font-medium text-rose-600 shadow-sm transition-colors hover:bg-rose-500 hover:text-cream-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          {photos.length < MAX_PHOTOS && (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-cream-300 bg-cream-50 px-4 py-6 text-sm font-medium text-ink-500 transition-colors hover:border-moss-500 hover:bg-cream-100">
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
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-cream-300 bg-cream-50 px-4 py-3 transition-colors hover:border-cream-300">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="h-4 w-4 accent-moss-700"
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-ink-900">
              Make this pet&rsquo;s profile public
            </div>
            <div className="text-xs text-ink-500">
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
          className="rounded-full bg-moss-700 px-4 sm:px-6 lg:px-8 py-2.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 disabled:opacity-50"
        >
          {pending ? "Saving…" : editing ? "Save changes" : "Add pet"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="rounded-full border border-rose-200 bg-cream-50 px-4 py-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
          >
            Delete pet
          </button>
        )}
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-xl border border-cream-300 bg-cream-50 px-4 py-2.5 text-base text-ink-900 placeholder-ink-300 transition focus:border-moss-700 focus:outline-none focus:ring-4 focus:ring-moss-100/60";

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
      <div className="mb-1.5 text-xs font-medium text-ink-700">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
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
          ? "bg-ink-900 text-cream-50"
          : "text-ink-500 hover:text-ink-900"
      }`}
    >
      {label}
    </button>
  );
}
