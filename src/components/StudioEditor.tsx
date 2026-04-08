"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Entity, EntityType, Story } from "@/lib/types";

interface StudioEditorProps {
  story: Story;
}

const TYPE_LABELS: Record<EntityType, string> = {
  character: "Characters",
  environment: "Environments",
  object: "Objects",
};

const TYPE_EMOJI: Record<EntityType, string> = {
  character: "\u{1F9D1}",
  environment: "\u{1F30D}",
  object: "\u{1F9F8}",
};

export default function StudioEditor({ story: initialStory }: StudioEditorProps) {
  const router = useRouter();
  const [story, setStory] = useState<Story>(initialStory);
  const [entities, setEntities] = useState<Entity[]>(initialStory.entities ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialStory.entities?.[0]?.id ?? null
  );
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  // Lazy entity extraction for stories created before AI Studio existed.
  useEffect(() => {
    if (entities.length > 0 || extracting) return;
    setExtracting(true);
    fetch(`/api/stories/${story.id}/entities`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) throw new Error("extract failed");
        const data = (await res.json()) as { entities: Entity[] };
        setEntities(data.entities);
        setSelectedId(data.entities[0]?.id ?? null);
      })
      .catch((err) => {
        console.error(err);
        setError("Couldn't analyze this story's entities. Try refreshing.");
      })
      .finally(() => setExtracting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id]);

  const grouped = useMemo(() => {
    const out: Record<EntityType, Entity[]> = {
      character: [],
      environment: [],
      object: [],
    };
    for (const e of entities) out[e.type].push(e);
    return out;
  }, [entities]);

  const selected = entities.find((e) => e.id === selectedId) ?? null;

  async function applyEdit() {
    if (!selected || !instruction.trim() || busy) return;
    setBusy(true);
    setError(null);
    setBusyMessage("Thinking about your change...");

    try {
      const res = await fetch(`/api/stories/${story.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId: selected.id,
          instruction: instruction.trim(),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Edit failed");
      }

      const data = (await res.json()) as {
        kind: "appearance" | "personality";
        title: string;
        pages: Story["pages"];
        entities: Entity[];
      };

      setStory({
        ...story,
        title: data.title,
        pages: data.pages,
        entities: data.entities,
        cover_image: data.pages[0]?.imageUrl ?? story.cover_image,
      });
      setEntities(data.entities);
      // Keep the same entity selected if it still exists.
      if (!data.entities.find((e) => e.id === selected.id)) {
        setSelectedId(data.entities[0]?.id ?? null);
      }
      setInstruction("");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again."
      );
    } finally {
      setBusy(false);
      setBusyMessage("");
    }
  }

  return (
    <div className="relative mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/studio"
            className="text-sm font-bold text-purple-400 hover:text-purple-600"
          >
            &larr; All stories
          </Link>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold text-purple-700">
            {story.title}
          </h1>
          <p className="mt-1 text-sm font-medium text-purple-400 line-clamp-2">
            {story.prompt}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/canvas/${story.id}`}
            className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-bold text-white shadow-md hover:scale-105"
          >
            Open in Studio &rarr;
          </Link>
          <Link
            href={`/read/${story.id}`}
            className="rounded-full bg-purple-50 px-4 py-2 text-sm font-bold text-purple-500 hover:bg-purple-100"
          >
            Read &rarr;
          </Link>
        </div>
      </div>

      {extracting && entities.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-purple-200 bg-white p-8 text-center">
          <p className="text-lg font-bold text-purple-500">
            Analyzing your story...
          </p>
          <p className="mt-1 text-sm font-medium text-purple-300">
            Finding characters, environments, and objects.
          </p>
        </div>
      )}

      {entities.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          {/* Entity rail */}
          <aside className="space-y-5">
            {(["character", "environment", "object"] as EntityType[]).map(
              (type) => {
                const list = grouped[type];
                if (list.length === 0) return null;
                return (
                  <div key={type}>
                    <h3 className="mb-2 px-1 text-xs font-black uppercase tracking-wider text-purple-400">
                      {TYPE_EMOJI[type]} {TYPE_LABELS[type]}
                    </h3>
                    <div className="space-y-2">
                      {list.map((e) => {
                        const isSelected = e.id === selectedId;
                        return (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => setSelectedId(e.id)}
                            className={`w-full rounded-2xl border-2 px-4 py-3 text-left text-sm font-bold transition-all ${
                              isSelected
                                ? "border-purple-400 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 shadow-md"
                                : "border-purple-100 bg-white text-purple-500 hover:border-purple-300 hover:bg-purple-50"
                            }`}
                          >
                            {e.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }
            )}
          </aside>

          {/* Detail panel */}
          <section className="space-y-6">
            {selected ? (
              <div className="rounded-3xl border-3 border-purple-200 bg-white p-6 shadow-md">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-2xl">{TYPE_EMOJI[selected.type]}</span>
                  <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-purple-700">
                    {selected.name}
                  </h2>
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-black uppercase text-purple-500">
                    {selected.type}
                  </span>
                </div>
                <p className="mb-5 text-sm font-medium leading-relaxed text-purple-500">
                  {selected.description}
                </p>

                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-purple-400">
                  What do you want to change?
                </label>
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  disabled={busy}
                  rows={3}
                  placeholder={
                    selected.type === "character"
                      ? "e.g. give Luna green eyes, or make her shy and afraid of water"
                      : selected.type === "environment"
                      ? "e.g. make the forest snowy and silent"
                      : "e.g. turn the lantern into a glowing crystal"
                  }
                  className="w-full resize-none rounded-2xl border-2 border-purple-200 bg-purple-50/40 px-4 py-3 text-sm font-medium text-purple-700 placeholder-purple-300 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-purple-300">
                    Appearance changes only redraw images. Personality changes
                    rewrite the whole story.
                  </p>
                  <button
                    type="button"
                    onClick={applyEdit}
                    disabled={busy || !instruction.trim()}
                    className="shrink-0 rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-6 py-3 text-sm font-black text-white shadow-md shadow-purple-200 transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                  >
                    {busy ? "Applying..." : "Apply change"}
                  </button>
                </div>
                {error && (
                  <p className="mt-3 text-sm font-bold text-rose-500">
                    {error}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-3xl border-2 border-dashed border-purple-200 bg-white p-8 text-center text-sm font-medium text-purple-400">
                Pick something from the left to start editing.
              </div>
            )}

            {/* Page thumbnails */}
            <div>
              <h3 className="mb-3 px-1 text-xs font-black uppercase tracking-wider text-purple-400">
                Story pages ({story.pages.length})
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {story.pages.map((page) => (
                  <div
                    key={page.pageNumber}
                    className="overflow-hidden rounded-2xl border-2 border-purple-100 bg-white shadow-sm"
                  >
                    <div className="relative aspect-square">
                      {page.imageUrl ? (
                        <Image
                          src={page.imageUrl}
                          alt={`Page ${page.pageNumber}`}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-purple-50 text-purple-300">
                          ?
                        </div>
                      )}
                      <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-black text-purple-500">
                        {page.pageNumber}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {busy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-purple-900/40 backdrop-blur-sm">
          <div className="rounded-3xl bg-white px-10 py-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-purple-200 border-t-purple-500" />
            <p className="font-[family-name:var(--font-display)] text-xl font-bold text-purple-700">
              Remixing your story...
            </p>
            <p className="mt-1 text-sm font-medium text-purple-400">
              {busyMessage || "This can take 30+ seconds for big edits."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
