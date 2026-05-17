"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Character, CharacterKind } from "@/lib/types";

type Props = {
  initial: Character | null;
  nextHref?: string;
};

// Character creation form (V2). A single reference photo per character
// is what the AI uses to keep them looking like themselves across
// pages, so the upload zone is the most important input on this page —
// it gets the largest visual treatment and supports drag-and-drop in
// addition to click-to-pick. Legacy characters that were saved with
// multiple reference URLs are coerced down to the first one on load.
export default function CharacterForm({ initial, nextHref }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<CharacterKind>(initial?.kind ?? "person");
  const [name, setName] = useState(initial?.name ?? "");
  const [roleLabel, setRoleLabel] = useState(initial?.role_label ?? "");
  const [traits, setTraits] = useState(initial?.traits ?? "");
  const [species, setSpecies] = useState(initial?.species ?? "");
  // Single photo URL (or null when empty). The DB column is still a
  // string[]; on save we wrap this into `[photo]` / `[]`.
  const [photo, setPhoto] = useState<string | null>(
    initial?.reference_photo_urls?.[0] ?? null
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

  async function ingestFile(fileList: FileList | File[]) {
    // Only the first image-typed file is used — every character has a
    // single reference photo. Extra files in a multi-select drop are
    // ignored on purpose.
    const file = Array.from(fileList).find((f) =>
      f.type.startsWith("image/")
    );
    if (!file) return;
    if (photo) {
      // Defensive: the upload zone is hidden once a photo exists, but
      // a programmatic drop could still hit this. Surface a clear
      // message instead of silently replacing the file.
      setError("Remove the current photo before uploading a new one.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const url = await uploadOne(file);
      setPhoto(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await ingestFile(files);
    e.target.value = "";
  }

  async function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    if (photo) return;
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    await ingestFile(files);
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
        // DB column is string[]; we store a single-element array (or
        // empty) to keep the shape stable for existing callers.
        reference_photo_urls: photo ? [photo] : [],
      };
      const url = initial ? `/api/characters/${initial.id}` : "/api/characters";
      const method = initial ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      // On create (not edit), pass the new character's id back to the
      // wizard via `addedCharacter` so it can auto-select the character
      // in the cast on return. Only honored when there's a nextHref to
      // route through — the bare /characters listing ignores the hint.
      const respBody = (await res.json().catch(() => null)) as
        | { character?: { id?: string } }
        | null;
      const newId = respBody?.character?.id;
      let dest = nextHref ?? "/characters";
      if (!initial && newId && nextHref) {
        const sep = nextHref.includes("?") ? "&" : "?";
        dest = `${nextHref}${sep}addedCharacter=${encodeURIComponent(newId)}`;
      }
      router.push(dest);
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

  // Header title text mirrors the destination — "Add a character" for
  // the new flow, "Edit <name>" for the existing-record flow. Owning the
  // title inside the form lets us pair it with the primary submit on the
  // same row, matching the wizard's top-right CTA pattern.
  const headerTitle = initial
    ? `Edit ${initial.name || "character"}`
    : "Add a character";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Header: title + Type pill on the left, primary submit on the right.
          Pulling Type into the header keeps it visible without spending a
          full row on it, which is the difference between fitting in a
          desktop viewport and forcing a scroll. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-ink-900">{headerTitle}</h1>
          <div className="inline-flex rounded-full border border-cream-300 bg-cream-50 p-1">
            {(["person", "pet"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  kind === k
                    ? "bg-ink-900 text-cream-50"
                    : "text-ink-500 hover:text-ink-900"
                }`}
              >
                {k === "person" ? "Person" : "Pet"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={saving || uploading}
            className="text-sm font-medium text-ink-500 hover:text-ink-900 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || uploading || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-moss-700 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Add character"}
          </button>
        </div>
      </div>

      {/* Two-column desktop layout: identity + traits on the left, the
          reference-photo zone on the right. Stacks on small screens. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-cream-300 bg-cream-50 p-4 sm:p-5">
          <div className="mb-3">
            <h2 className="font-[family-name:var(--font-display)] text-base font-semibold text-ink-900">
              About this character
            </h2>
            <p className="mt-0.5 text-xs text-ink-500">
              A name is required. Everything else helps the AI render them
              specifically.
            </p>
          </div>

          <div className="space-y-3">
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

        <section className="rounded-2xl border border-cream-300 bg-cream-50 p-4 sm:p-5">
          <div className="mb-3">
            <h2 className="font-[family-name:var(--font-display)] text-base font-semibold text-ink-900">
              Reference photo
            </h2>
          </div>

          {photo ? (
            <div className="relative aspect-square w-40 overflow-hidden rounded-xl border border-cream-300">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo}
                alt={name.trim() ? `Reference photo of ${name.trim()}` : ""}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => setPhoto(null)}
                aria-label="Remove photo"
                className="absolute right-1 top-1 rounded-full bg-cream-50/95 px-2 py-0.5 text-[10px] font-medium text-rose-600 shadow-sm transition-colors hover:bg-rose-500 hover:text-cream-50"
              >
                Remove
              </button>
            </div>
          ) : (
            <label
              onDragOver={(e) => {
                e.preventDefault();
                if (!uploading) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`group relative flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-6 sm:py-7 text-center transition-all ${
                dragOver
                  ? "border-moss-700 bg-moss-100"
                  : "border-moss-500/60 bg-moss-100/40 hover:border-moss-700 hover:bg-moss-100"
              }`}
            >
              <UploadIcon
                className={`shrink-0 h-7 w-7 text-moss-700 transition-transform ${
                  dragOver ? "scale-110" : "group-hover:scale-105"
                }`}
              />
              <div className="text-sm font-semibold text-ink-900">
                {uploading
                  ? "Uploading…"
                  : dragOver
                    ? "Drop to upload"
                    : `Upload ${kind === "pet" ? "your pet's" : "their"} photo`}
              </div>
              <div className="text-xs text-ink-500">
                Click or drag an image. JPG, PNG, or WebP.
              </div>
              <input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={handlePick}
                className="sr-only"
                aria-label="Upload reference photo"
              />
            </label>
          )}
        </section>
      </div>

      {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

      {initial && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="rounded-full border border-rose-200 bg-cream-50 px-4 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      )}
    </form>
  );
}

const inputCls =
  "w-full rounded-xl border border-cream-300 bg-cream-50 px-3.5 py-2 text-sm text-ink-900 placeholder-ink-300 transition focus:border-moss-700 focus:outline-none focus:ring-4 focus:ring-moss-100/60";

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
      <div className="mb-1 text-xs font-medium text-ink-700">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-ink-500 leading-snug">{hint}</div>}
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
