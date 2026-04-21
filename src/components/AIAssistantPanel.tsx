"use client";

import { useEffect, useState } from "react";
import type { StoryPage } from "@/lib/types";
import AIAssistantPreview, {
  type Pending,
} from "./AIAssistantPreview";

const GLOBAL_PROMPT_KEY = "storyink.aiGlobalSystemPrompt";

// Imperative job polling — the assistant flow runs inside an async function,
// so a hook doesn't fit cleanly. Polls /api/jobs/[id] once per second until
// the Inngest function marks the row done or failed. Mirrors the contract
// of useJobPolling but returns the result directly.
const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 180; // 3 min — image regen can be slow on cold start

async function waitForJob<T>(jobId: string): Promise<T> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      if (res.ok) {
        const row = (await res.json()) as {
          status: "queued" | "running" | "done" | "failed";
          result: T | null;
          error: string | null;
        };
        if (row.status === "done") return (row.result ?? null) as T;
        if (row.status === "failed") {
          throw new Error(row.error ?? "Generation failed");
        }
      }
    } catch (err) {
      // Bubble terminal errors; swallow transient fetch failures.
      if (err instanceof Error && err.message.startsWith("Generation failed"))
        throw err;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("Generation timed out");
}

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
  // "auto" uses the classifier (the default primary action); "text"/"image"
  // are manual overrides that skip classification and run just that side.
  const [busy, setBusy] = useState<"auto" | "text" | "image" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inferredTargets, setInferredTargets] = useState<
    ("text" | "image")[] | null
  >(null);
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
    setInferredTargets(null);
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

  // Single infer call. When mode === "auto" the server runs the classifier
  // and decides between text, image, or both. When mode is "text" or "image"
  // we pass `targets` to bypass classification.
  //
  // Backend is now Inngest-backed: the HTTP POST returns a jobId 202, we
  // poll /api/jobs/[id] until the Inngest function writes its result. The
  // payload shape is the same as the old synchronous endpoint.
  async function runGeneration(mode: "auto" | "text" | "image") {
    const trimmed = userPrompt.trim();
    if (!trimmed) {
      setError("Write a prompt first.");
      return;
    }
    setBusy(mode);
    setError(null);
    setPending(null);
    setInferredTargets(null);
    try {
      const res = await fetch(
        `/api/stories/${storyId}/pages/${currentPage.pageNumber}/ai/infer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: trimmed,
            globalSystemPrompt: globalPrompt || null,
            ...(mode !== "auto" ? { targets: [mode] } : {}),
          }),
        }
      );
      if (!res.ok && res.status !== 202) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || "Couldn't enqueue generation");
      }
      const { jobId } = (await res.json()) as { jobId: string };

      const payload = await waitForJob<{
        targets: ("text" | "image")[];
        text: string | null;
        imageUrl: string | null;
      }>(jobId);

      setInferredTargets(payload.targets);

      const wantsText = payload.targets.includes("text");
      const wantsImage = payload.targets.includes("image");

      if (wantsText && wantsImage) {
        if (payload.text == null && payload.imageUrl == null) {
          setError("Couldn't generate text or illustration.");
          return;
        }
        setPending({
          kind: "both",
          page: currentPage,
          newText: payload.text ?? undefined,
          newImageUrl: payload.imageUrl ?? undefined,
        });
      } else if (wantsText) {
        if (payload.text == null) {
          setError("Couldn't generate new text.");
          return;
        }
        setPending({
          kind: "text",
          page: currentPage,
          newText: payload.text,
        });
      } else if (wantsImage) {
        if (payload.imageUrl == null) {
          setError("Couldn't generate a new illustration.");
          return;
        }
        setPending({
          kind: "image",
          page: currentPage,
          newImageUrl: payload.imageUrl,
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
    else if (pending.kind === "image") onApplyImage(pending.newImageUrl);
    else {
      // Both mode — apply whichever sides actually produced a result.
      if (pending.newText != null) onApplyText(pending.newText);
      if (pending.newImageUrl != null) onApplyImage(pending.newImageUrl);
    }
    setPending(null);
    setUserPrompt("");
    setInferredTargets(null);
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

      <button
        type="button"
        onClick={() => runGeneration("auto")}
        disabled={busy !== null}
        className="w-full rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-3 py-2.5 text-xs font-black uppercase text-white shadow-md shadow-purple-200 transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
      >
        {busy === "auto" ? "Thinking…" : "Generate"}
      </button>

      <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-purple-400">
        <span className="text-purple-300">Force:</span>
        <button
          type="button"
          onClick={() => runGeneration("text")}
          disabled={busy !== null}
          className="rounded-full bg-purple-50 px-2 py-0.5 font-black uppercase text-purple-500 transition-all hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "text" ? "Writing…" : "Text only"}
        </button>
        <button
          type="button"
          onClick={() => runGeneration("image")}
          disabled={busy !== null}
          className="rounded-full bg-pink-50 px-2 py-0.5 font-black uppercase text-pink-500 transition-all hover:bg-pink-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "image" ? "Drawing…" : "Image only"}
        </button>
      </div>

      {inferredTargets && inferredTargets.length > 0 && !pending && !error && (
        <p className="text-center text-[10px] font-bold text-purple-400">
          Inferred: {inferredTargets.join(" + ")}
        </p>
      )}

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
