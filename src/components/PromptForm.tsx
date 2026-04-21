"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import GeneratingOverlay from "./GeneratingOverlay";
import { useJobPolling } from "@/lib/useJobPolling";

const PAGE_OPTIONS = [3, 5, 7, 10, 12];

export default function PromptForm() {
  const [prompt, setPrompt] = useState("");
  const [pageCount, setPageCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { state, start } = useJobPolling<{ storyId: string }>();

  // Watch the Inngest job to completion. On "done" we navigate to the new
  // story; on "failed" we surface the error and unblock the form.
  useEffect(() => {
    if (state.kind === "done") {
      router.push(`/read/${state.result.storyId}`);
    } else if (state.kind === "failed") {
      setError(state.error);
      setGenerating(false);
    }
  }, [state, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;

    setGenerating(true);
    setError("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), pageCount }),
      });
      if (!res.ok && res.status !== 202) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Generation failed");
      }
      const { jobId } = (await res.json()) as { jobId: string };
      start(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setGenerating(false);
    }
  }

  return (
    <>
      {generating && <GeneratingOverlay />}
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-2xl space-y-5"
      >
        {/* Textarea with colorful border */}
        <div className="rounded-3xl bg-gradient-to-r from-purple-400 via-pink-400 to-orange-300 p-[3px] shadow-lg shadow-purple-200/50">
          <div className="rounded-3xl bg-white">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A tiny dragon who loves to bake cupcakes and goes on a quest to find the world's sweetest strawberry..."
              rows={4}
              maxLength={1000}
              className="w-full resize-none rounded-3xl bg-transparent px-6 py-5 text-lg text-purple-900 placeholder-purple-300 focus:outline-none"
            />
            <div className="flex items-center justify-between border-t-2 border-dashed border-purple-100 px-6 py-3">
              <span className="text-xs font-bold text-purple-300">
                {prompt.length}/1000
              </span>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-purple-500">
                  Pages:
                </span>
                <div className="flex gap-1.5">
                  {PAGE_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPageCount(n)}
                      className={`h-9 w-9 rounded-xl text-sm font-black transition-all ${
                        pageCount === n
                          ? "scale-110 bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-md shadow-purple-300"
                          : "bg-purple-50 text-purple-400 hover:scale-105 hover:bg-purple-100"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Generate button */}
        <div className="flex justify-center">
          <button
            type="submit"
            disabled={!prompt.trim() || generating}
            className="group flex h-16 items-center gap-3 rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-10 text-xl font-black text-white shadow-xl shadow-purple-300/40 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-pink-300/50 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
          >
            <span className="text-2xl transition-transform group-hover:rotate-12">
              &#9997;&#65039;
            </span>
            Create My Story!
          </button>
        </div>

        {error && (
          <p className="text-center text-sm font-bold text-red-400">
            Oops! {error}
          </p>
        )}
      </form>
    </>
  );
}
