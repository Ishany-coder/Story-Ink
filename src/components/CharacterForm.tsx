"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Character, CharacterKind } from "@/lib/types";

const MAX_PHOTOS = 5;

type Props = {
  initial: Character | null;
  nextHref?: string;
};

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

  async function handleFile(file: File) {
    if (photos.length >= MAX_PHOTOS) {
      setError(`Max ${MAX_PHOTOS} photos`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const { url } = (await res.json()) as { url: string };
      setPhotos((prev) => [...prev, url]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setUploading(false);
    }
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
      <div>
        <label className="block text-sm font-medium mb-2">Type</label>
        <div className="flex gap-2">
          {(["person", "pet"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`px-4 py-2 rounded border ${
                kind === k ? "bg-black text-white" : "bg-white"
              }`}
            >
              {k === "person" ? "Person" : "Pet"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Name</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border rounded px-3 py-2"
          placeholder={kind === "person" ? "e.g. Maya" : "e.g. Buddy"}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Role label (optional)
        </label>
        <input
          value={roleLabel ?? ""}
          onChange={(e) => setRoleLabel(e.target.value)}
          className="w-full border rounded px-3 py-2"
          placeholder='e.g. "Mom", "the hero"'
        />
      </div>

      {kind === "pet" && (
        <div>
          <label className="block text-sm font-medium mb-2">
            Species (optional)
          </label>
          <input
            value={species ?? ""}
            onChange={(e) => setSpecies(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="dog, cat, etc."
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-2">
          Traits / personality (optional)
        </label>
        <textarea
          value={traits ?? ""}
          onChange={(e) => setTraits(e.target.value)}
          rows={3}
          className="w-full border rounded px-3 py-2"
          placeholder="What makes them them? Quirks, hobbies, favorite things…"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Reference photos ({photos.length}/{MAX_PHOTOS})
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {photos.map((src, i) => (
            <div key={src} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                className="w-24 h-24 object-cover rounded border"
              />
              <button
                type="button"
                onClick={() =>
                  setPhotos((prev) => prev.filter((_, j) => j !== i))
                }
                className="absolute -top-2 -right-2 bg-white border rounded-full w-6 h-6 text-xs"
                aria-label="remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
          disabled={uploading || photos.length >= MAX_PHOTOS}
        />
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || uploading || !name.trim()}
          className="px-4 py-2 bg-black text-white rounded disabled:opacity-50"
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Add character"}
        </button>
        {initial && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="px-4 py-2 border rounded text-red-600"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
