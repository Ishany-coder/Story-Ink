"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Character, CharacterKind } from "@/lib/types";

const MAX_PHOTOS = 5;

type Props = {
  initial: Character | null;
  nextHref?: string;
};

// Character creation form (V2). Reference photos are how the AI keeps
// people / pets looking like them across pages, so the upload zone is
// the most important input on this page — it gets the largest visual
// treatment and supports drag-and-drop in addition to click-to-pick.
export default function CharacterForm({ initial, nextHref }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<CharacterKind>(initial?.kind ?? "person");
  const [name, setName] = useState(initial?.name ?? "");
  const [roleLabel, setRoleLabel] = useState(initial?.role_label ?? "");
  const [traits, setTraits] = useState(initial?.traits ?? "");
  const [species, setSpecies] = useState(initial?.species ?? "");
  const [photos, setPhotos] = useState<string[]>(
    initial?.reference_photo_urls ?? []
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Drag-and-drop highlight state. Toggles a stronger fill + scale on
  // the upload icon while the user is dragging files over the zone.
  const [dragOver, setDragOver] = useState(false);

  async function uploadOne(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) throw new Error(await res.text());
    const body = (await res.json()) as { url: string };
    return body.url;
  }

  async function ingestFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((f) =>
      f.type.startsWith("image/")
    );
    if (files.length === 0) return;
    if (photos.length >= MAX_PHOTOS) {
      setError(`Max ${MAX_PHOTOS} photos`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const room = MAX_PHOTOS - photos.length;
      const trimmed = files.slice(0, room);
      const uploaded: string[] = [];
      for (const f of trimmed) {
        uploaded.push(await uploadOne(f));
      }
      setPhotos((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await ingestFiles(files);
    e.target.value = "";
  }

  async function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    if (photos.length >= MAX_PHOTOS) return;
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    await ingestFiles(files);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        kind,
        name,
        role_label: roleLabel || null,
        traits: traits || null,
        species: kind === "pet" ? species || null : null,
        reference_photo_urls: photos,
      };
      const url = initial ? `/api/characters/${initial.id}` : "/api/characters";
      const method = initial ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(nextHref ?? "/characters");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    if (!confirm(`Delete ${initial.name}?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/characters/${initial.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      router.push("/characters");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Type toggle: high-contrast pill with the same shape language
          as the wizard's other radio groups. */}
      <Field label="Type">
        <div className="inline-flex rounded-full border border-cream-300 bg-cream-50 p-1">
          {(["person", "pet"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                kind === k
                  ? "bg-ink-900 text-cream-50"
                  : "text-ink-500 hover:text-ink-900"
              }`}
            >
              {k === "person" ? "Person" : "Pet"}
            </button>
          ))}
        </div>
      </Field>

      <section className="rounded-2xl border border-cream-300 bg-cream-50 p-5 sm:p-6">
        <div className="mb-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink-900">
            About this character
          </h2>
          <p className="mt-0.5 text-xs text-ink-500">
            A name is required. Everything else helps the AI render them
            specifically.
          </p>
        </div>

        <div className="space-y-4">
          <Field label="Name">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder={kind === "person" ? "e.g. Maya" : "e.g. Buddy"}
            />
          </Field>

          <Field label="Role label (optional)">
            <input
              value={roleLabel ?? ""}
              onChange={(e) => setRoleLabel(e.target.value)}
              className={inputCls}
              placeholder='e.g. "Mom", "the hero"'
            />
          </Field>

          {kind === "pet" && (
            <Field label="Species (optional)">
              <input
                value={species ?? ""}
                onChange={(e) => setSpecies(e.target.value)}
                className={inputCls}
                placeholder="dog, cat, etc."
              />
            </Field>
          )}

          <Field
            label="Traits / personality (optional)"
            hint="Quirks, hobbies, favorite things. The more specific, the better."
          >
            <textarea
              value={traits ?? ""}
              onChange={(e) => setTraits(e.target.value)}
              rows={3}
              className={`${inputCls} resize-none`}
              placeholder="What makes them them?"
            />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-cream-300 bg-cream-50 p-5 sm:p-6">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink-900">
              Reference photos
            </h2>
            <p className="mt-0.5 text-xs text-ink-500">
              The AI uses these on every page so the character looks like
              the character. 3–5 clear photos in different poses works best.
            </p>
          </div>
          <span className="text-xs text-ink-300">
            {photos.length}/{MAX_PHOTOS}
          </span>
        </div>

        <div className="space-y-3">
          {photos.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {photos.map((src, i) => (
                <div
                  key={src}
                  className="relative aspect-square overflow-hidden rounded-xl border border-cream-300"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={name.trim() ? `Reference photo of ${name.trim()}` : ""}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setPhotos((prev) => prev.filter((_, j) => j !== i))
                    }
                    aria-label="Remove photo"
                    className="absolute right-1 top-1 rounded-full bg-cream-50/95 px-2 py-0.5 text-[10px] font-medium text-rose-600 shadow-sm transition-colors hover:bg-rose-500 hover:text-cream-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {photos.length < MAX_PHOTOS && (
            <label
              onDragOver={(e) => {
                e.preventDefault();
                if (!uploading) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 text-center transition-all ${
                photos.length === 0 ? "py-10 sm:py-12" : "py-5"
              } ${
                dragOver
                  ? "border-moss-700 bg-moss-100"
                  : "border-moss-500/60 bg-moss-100/40 hover:border-moss-700 hover:bg-moss-100"
              }`}
            >
              <UploadIcon
                className={`shrink-0 text-moss-700 transition-transform ${
                  photos.length === 0 ? "h-8 w-8" : "h-5 w-5"
                } ${dragOver ? "scale-110" : "group-hover:scale-105"}`}
              />
              {photos.length === 0 ? (
                <>
                  <div className="text-sm font-semibold text-ink-900">
                    {uploading
                      ? "Uploading…"
                      : dragOver
                        ? "Drop to upload"
                        : `Upload ${kind === "pet" ? "your pet's" : "their"} photos`}
                  </div>
                  <div className="text-xs text-ink-500">
                    Click to choose, or drag images here. JPG or PNG, up to{" "}
                    {MAX_PHOTOS}.
                  </div>
                </>
              ) : (
                <div className="text-sm font-semibold text-moss-900">
                  {uploading
                    ? "Uploading…"
                    : dragOver
                      ? "Drop to add"
                      : `+ Add more (${photos.length}/${MAX_PHOTOS})`}
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
        </div>
      </section>

      {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="submit"
          disabled={saving || uploading || !name.trim()}
          className="rounded-full bg-moss-700 px-6 py-2.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Add character"}
        </button>
        {initial && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="rounded-full border border-rose-200 bg-cream-50 px-4 py-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
          >
            Delete
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

function UploadIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      <polyline points="7 9 12 4 17 9" />
      <line x1="12" y1="4" x2="12" y2="16" />
    </svg>
  );
}
