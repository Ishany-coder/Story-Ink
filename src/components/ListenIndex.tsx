"use client";

import { useEffect, useState } from "react";
import StoryLinkCard from "./StoryLinkCard";
import NarratorSetup from "./NarratorSetup";
import { readStoredVoice, storeVoice } from "./NarrationControls";

// Top-level client component for /listen. Shows the current voice status
// (set up / re-record) above a grid of stories. Each card deep-links into
// /read/[id], where NarrationControls picks up the same localStorage voice
// and shows play buttons.

interface StoryRow {
  id: string;
  title: string;
  prompt: string;
  cover_image: string | null;
  page_count: number;
  created_at: string;
}

export default function ListenIndex({ stories }: { stories: StoryRow[] }) {
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    const stored = readStoredVoice();
    setVoiceId(stored.voiceId);
    setVoiceName(stored.voiceName);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="text-center sm:text-left">
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold text-purple-700">
            Listen &#127908;
          </h1>
          <p className="mt-1 text-lg font-semibold text-purple-400">
            Pick a story and hear it in your own cloned voice.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {voiceId ? (
            <>
              <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-500">
                Voice: {voiceName ?? "unnamed"}
              </span>
              <button
                type="button"
                onClick={() => setSetupOpen(true)}
                className="rounded-full bg-purple-100 px-3 py-1.5 text-xs font-black uppercase text-purple-600 hover:bg-purple-200"
              >
                Re-record
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-4 py-2 text-xs font-black uppercase tracking-wider text-white shadow-md hover:scale-[1.02]"
            >
              Set up narrator
            </button>
          )}
        </div>
      </div>

      {!voiceId && (
        <div className="mb-6 rounded-2xl border-2 border-dashed border-purple-200 bg-purple-50/40 px-4 py-3 text-center text-[12px] font-bold text-purple-500">
          Record your voice once and every page of every book below will be
          read aloud in it.
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {stories.map((story) => (
          <StoryLinkCard
            key={story.id}
            id={story.id}
            title={story.title}
            prompt={story.prompt}
            coverImage={story.cover_image}
            pageCount={story.page_count}
            createdAt={story.created_at}
            href={`/read/${story.id}`}
            badge="Listen"
          />
        ))}
      </div>

      <NarratorSetup
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        existingVoiceName={voiceName}
        onCloned={(newVoiceId, newVoiceName) => {
          storeVoice(newVoiceId, newVoiceName);
          setVoiceId(newVoiceId);
          setVoiceName(newVoiceName);
          setSetupOpen(false);
        }}
      />
    </div>
  );
}
