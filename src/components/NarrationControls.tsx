"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Story } from "@/lib/types";

// Controls rendered under the slide in the reader. Three responsibilities:
//  - "Set up narrator" if no voiceId saved on this device.
//  - Per-page play/pause button when a voice exists.
//  - "Play whole story" that chains audio across pages and advances the
//    slide on each `ended` event.

const VOICE_ID_KEY = "storyink.elevenlabs.voiceId";
const VOICE_NAME_KEY = "storyink.elevenlabs.voiceName";

export function readStoredVoice(): {
  voiceId: string | null;
  voiceName: string | null;
} {
  if (typeof window === "undefined") {
    return { voiceId: null, voiceName: null };
  }
  try {
    return {
      voiceId: localStorage.getItem(VOICE_ID_KEY),
      voiceName: localStorage.getItem(VOICE_NAME_KEY),
    };
  } catch {
    return { voiceId: null, voiceName: null };
  }
}

export function storeVoice(voiceId: string, voiceName: string): void {
  try {
    localStorage.setItem(VOICE_ID_KEY, voiceId);
    localStorage.setItem(VOICE_NAME_KEY, voiceName);
  } catch {
    // localStorage may be disabled; fallback handled by caller.
  }
}

interface Props {
  story: Story;
  currentPage: number; // 0-indexed
  onAdvance: () => void; // advance to the next page
  voiceId: string | null;
  voiceName: string | null;
  onOpenSetup: () => void;
}

export default function NarrationControls({
  story,
  currentPage,
  onAdvance,
  voiceId,
  voiceName,
  onOpenSetup,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  // "auto" = playing the whole story end-to-end; "single" = just this page.
  const [mode, setMode] = useState<"single" | "auto">("single");
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Mode is read inside the `ended` handler, which captures at subscribe
  // time — keep a ref so we can see the current value.
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Stop whenever we navigate to a different page while not in auto-advance
  // mode. During auto mode the page change IS the trigger to play next.
  useEffect(() => {
    if (modeRef.current === "auto") return;
    stopPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const stopPlayback = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.src = "";
    }
    audioRef.current = null;
    setPlaying(false);
    setLoading(false);
  }, []);

  const fetchAudioUrl = useCallback(
    async (pageIndex: number): Promise<string> => {
      if (!voiceId) throw new Error("No voice set up");
      const page = story.pages[pageIndex];
      const res = await fetch(
        `/api/stories/${story.id}/pages/${page.pageNumber}/narrate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceId }),
        }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || `Narrate failed (${res.status})`);
      }
      const { audioUrl } = (await res.json()) as { audioUrl: string };
      return audioUrl;
    },
    [story.id, story.pages, voiceId]
  );

  const play = useCallback(
    async (pageIndex: number) => {
      setError(null);
      setLoading(true);
      try {
        const url = await fetchAudioUrl(pageIndex);
        const el = new Audio(url);
        audioRef.current = el;
        el.onplaying = () => {
          setPlaying(true);
          setLoading(false);
        };
        el.onpause = () => setPlaying(false);
        el.onended = () => {
          setPlaying(false);
          if (modeRef.current === "auto") {
            // Advance parent to the next page — its effect on `currentPage`
            // doesn't auto-stop because modeRef says "auto". We then kick
            // off the next page's audio from the same handler flow below
            // (see the pageIndex-watching effect).
            onAdvance();
          }
        };
        el.onerror = () => {
          setError("Playback failed");
          setPlaying(false);
          setLoading(false);
        };
        await el.play();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Playback failed");
        setLoading(false);
      }
    },
    [fetchAudioUrl, onAdvance]
  );

  // When in auto mode and the page advances, start the next page's audio.
  // Stops itself at the last page.
  useEffect(() => {
    if (mode !== "auto") return;
    if (!voiceId) return;
    if (playing) return;
    if (loading) return;
    // Only start if there's no active element — otherwise we're either
    // still playing or the user paused.
    if (audioRef.current) return;
    play(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, currentPage]);

  // Drop any playback when the tab/route unmounts.
  useEffect(() => {
    return () => stopPlayback();
  }, [stopPlayback]);

  const togglePlayThisPage = useCallback(() => {
    if (playing) {
      stopPlayback();
      setMode("single");
      return;
    }
    setMode("single");
    void play(currentPage);
  }, [playing, stopPlayback, play, currentPage]);

  const toggleWholeStory = useCallback(() => {
    if (mode === "auto") {
      stopPlayback();
      setMode("single");
      return;
    }
    setMode("auto");
    void play(currentPage);
  }, [mode, stopPlayback, play, currentPage]);

  if (!voiceId) {
    return (
      <div className="flex items-center justify-center gap-2 pb-4">
        <button
          type="button"
          onClick={onOpenSetup}
          className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-4 py-2 text-xs font-black uppercase text-white shadow-md hover:scale-[1.02]"
        >
          <span className="text-base leading-none">&#127908;</span>
          Set up narrator
        </button>
        <span className="text-[11px] font-bold text-purple-400">
          Record your voice once to have it read every page aloud.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 pb-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={togglePlayThisPage}
          disabled={loading}
          className="flex items-center gap-2 rounded-2xl bg-purple-500 px-4 py-2 text-xs font-black uppercase text-white shadow-md transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          <span className="text-base leading-none">
            {playing && mode === "single" ? "\u23F8" : "\u25B6"}
          </span>
          {loading && !playing
            ? "Loading…"
            : playing && mode === "single"
              ? "Pause"
              : "Play page"}
        </button>
        <button
          type="button"
          onClick={toggleWholeStory}
          disabled={loading}
          className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-orange-400 px-4 py-2 text-xs font-black uppercase text-white shadow-md transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          <span className="text-base leading-none">
            {mode === "auto" ? "\u23F9" : "\u25B6\u25B6"}
          </span>
          {mode === "auto" ? "Stop story" : "Play whole story"}
        </button>
        <button
          type="button"
          onClick={onOpenSetup}
          className="rounded-full bg-purple-50 px-2.5 py-1 text-[10px] font-black uppercase text-purple-400 hover:bg-purple-100"
          title={`Current voice: ${voiceName ?? "unnamed"}`}
        >
          {voiceName ?? "voice"} · change
        </button>
      </div>
      {error && (
        <div className="rounded-full bg-rose-50 px-3 py-1 text-[11px] font-bold text-rose-500">
          {error}
        </div>
      )}
    </div>
  );
}
