"use client";

import { useEffect, useState } from "react";
import type { StoryPage } from "@/lib/types";
import AIAssistantPreview, {
  type Pending,
} from "./AIAssistantPreview";

const GLOBAL_PROMPT_KEY = "storyink.aiGlobalSystemPrompt";

interface Props {
  storyId: string;
  storyAiSystemPrompt: string | null | undefined;
  currentPage: StoryPage;
  onApplyText: (newText: string) => void;
  onApplyImage: (newImageUrl: string) => void;
  onStoryPromptSaved: (newPrompt: string | null) => void;
}

export default function AIAssistantPanel({
  storyId,
  storyAiSystemPrompt,
  currentPage,
  onApplyText,
  onApplyImage,
  onStoryPromptSaved,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [globalPrompt, setGlobalPrompt] = useState("");
  const [storyPrompt, setStoryPrompt] = useState(storyAiSystemPrompt ?? "");
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingStory, setSavingStory] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  const [userPrompt, setUserPrompt] = useState("");
  const [busy, setBusy] = useState<"text" | "image" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(GLOBAL_PROMPT_KEY);
      if (v != null) setGlobalPrompt(v);
    } catch {
      // localStorage may be disabled; ignore.
    }
  }, []);

  useEffect(() => {
    setStoryPrompt(storyAiSystemPrompt ?? "");
  }, [storyAiSystemPrompt]);

  // When the user flips pages, drop any preview from the old page — it's
  // no longer relevant and would be confusing if Apply'd onto a new page.
  useEffect(() => {
    setPending(null);
    setError(null);
  }, [currentPage.pageNumber]);

  function saveGlobalPrompt() {
    setSavingGlobal(true);
    setSettingsMsg(null);
    try {
      localStorage.setItem(GLOBAL_PROMPT_KEY, globalPrompt);
      setSettingsMsg("Global prompt saved on this device.");
    } catch {
      setSettingsMsg("Couldn't save — localStorage disabled?");
    } finally {
      setSavingGlobal(false);
    }
  }

  async function saveStoryPrompt() {
    setSavingStory(true);
    setSettingsMsg(null);
    try {
      const res = await fetch(`/api/stories/${storyId}/ai-system-prompt`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: storyPrompt || null }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || "Save failed");
      }
      const { systemPrompt } = (await res.json()) as {
        systemPrompt: string | null;
      };
      onStoryPromptSaved(systemPrompt);
      setSettingsMsg("Story prompt saved.");
    } catch (err) {
      setSettingsMsg(
        err instanceof Error ? err.message : "Couldn't save story prompt."
      );
    } finally {
      setSavingStory(false);
    }
  }

  async function runGeneration(kind: "text" | "image") {
    const trimmed = userPrompt.trim();
    if (!trimmed) {
      setError("Write a prompt first.");
      return;
    }
    setBusy(kind);
    setError(null);
    setPending(null);
    try {
      const res = await fetch(
        `/api/stories/${storyId}/pages/${currentPage.pageNumber}/ai/${kind}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: trimmed,
            globalSystemPrompt: globalPrompt || null,
          }),
        }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || "Generation failed");
      }
      if (kind === "text") {
        const { text } = (await res.json()) as { text: string };
        setPending({ kind: "text", page: currentPage, newText: text });
      } else {
        const { imageUrl } = (await res.json()) as { imageUrl: string };
        setPending({
          kind: "image",
          page: currentPage,
          newImageUrl: imageUrl,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't reach the assistant."
      );
    } finally {
      setBusy(null);
    }
  }

  function applyPending() {
    if (!pending) return;
    if (pending.kind === "text") onApplyText(pending.newText);
    else onApplyImage(pending.newImageUrl);
    setPending(null);
    setUserPrompt("");
  }

  function discardPending() {
    setPending(null);
  }

  return (
    <div className="space-y-3">
      {/* Settings */}
      <div className="rounded-2xl border-2 border-purple-100 bg-purple-50/40">
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-black uppercase tracking-wider text-purple-500"
        >
          <span>System prompts</span>
          <span className="text-xs">{settingsOpen ? "−" : "+"}</span>
        </button>
        {settingsOpen && (
          <div className="space-y-3 px-3 pb-3">
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-purple-400">
                Global (this device)
              </label>
              <textarea
                value={globalPrompt}
                onChange={(e) => setGlobalPrompt(e.target.value)}
                rows={3}
                placeholder="Applies to every story. E.g., &quot;Always use warm watercolor palettes.&quot;"
                className="w-full resize-none rounded-xl border border-purple-200 bg-white px-2 py-1.5 text-xs text-purple-900 outline-none focus:border-purple-400"
              />
              <button
                type="button"
                onClick={saveGlobalPrompt}
                disabled={savingGlobal}
                className="mt-1 w-full rounded-xl bg-purple-100 px-2 py-1 text-[10px] font-black uppercase text-purple-600 hover:bg-purple-200 disabled:opacity-50"
              >
                {savingGlobal ? "Saving…" : "Save global"}
              </button>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-purple-400">
                This story only
              </label>
              <textarea
                value={storyPrompt}
                onChange={(e) => setStoryPrompt(e.target.value)}
                rows={3}
                placeholder="Applies only to this story. E.g., &quot;The main character is Timmy, who has red hair.&quot;"
                className="w-full resize-none rounded-xl border border-purple-200 bg-white px-2 py-1.5 text-xs text-purple-900 outline-none focus:border-purple-400"
              />
              <button
                type="button"
                onClick={saveStoryPrompt}
                disabled={savingStory}
                className="mt-1 w-full rounded-xl bg-purple-100 px-2 py-1 text-[10px] font-black uppercase text-purple-600 hover:bg-purple-200 disabled:opacity-50"
              >
                {savingStory ? "Saving…" : "Save story prompt"}
              </button>
            </div>
            {settingsMsg && (
              <p className="text-[10px] font-bold text-purple-500">
                {settingsMsg}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Prompt input */}
      <div>
        <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-purple-400">
          Assistant prompt · page {currentPage.pageNumber}
        </label>
        <textarea
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          rows={4}
          placeholder="Describe what to change… e.g. &quot;make it sound more adventurous&quot; or &quot;the forest should be at night&quot;"
          className="w-full resize-none rounded-2xl border-2 border-purple-200 bg-white px-3 py-2 text-xs text-purple-900 outline-none focus:border-purple-400"
          disabled={busy !== null}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => runGeneration("text")}
          disabled={busy !== null}
          className="rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-2 text-[11px] font-black uppercase text-white shadow-sm transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          {busy === "text" ? "Writing…" : "Regen text"}
        </button>
        <button
          type="button"
          onClick={() => runGeneration("image")}
          disabled={busy !== null}
          className="rounded-2xl bg-gradient-to-r from-pink-500 to-orange-400 px-3 py-2 text-[11px] font-black uppercase text-white shadow-sm transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          {busy === "image" ? "Drawing…" : "Regen image"}
        </button>
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-500">
          {error}
        </p>
      )}

      {pending && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-600">
          Preview open — apply or discard to continue
        </p>
      )}

      <AIAssistantPreview
        pending={pending}
        onApply={applyPending}
        onDiscard={discardPending}
      />
    </div>
  );
}
