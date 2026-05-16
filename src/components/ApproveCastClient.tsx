"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Portrait = { characterId: string; name: string; portraitUrl: string };

export default function ApproveCastClient({
  storyId,
  portraits,
}: {
  storyId: string;
  portraits: Portrait[];
}) {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate(characterId: string) {
    setWorking(characterId);
    setError(null);
    try {
      const res = await fetch(
        `/api/stories/${storyId}/cast/${characterId}/regenerate`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error(await res.text());
      alert("Regenerating. Refresh in ~30 seconds to see the new portrait.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "regen failed");
    } finally {
      setWorking(null);
    }
  }

  async function approveAll() {
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`/api/stories/${storyId}/approve-cast`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(`/stories/${storyId}/progress`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "approve failed");
      setApproving(false);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {portraits.map((p) => (
          <div
            key={p.characterId}
            className="border rounded-lg overflow-hidden bg-white"
          >
            <div className="aspect-square bg-stone-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.portraitUrl}
                alt={p.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-3 flex items-center justify-between">
              <span className="font-medium">{p.name}</span>
              <button
                type="button"
                onClick={() => regenerate(p.characterId)}
                disabled={working === p.characterId}
                className="text-sm underline disabled:opacity-50"
              >
                {working === p.characterId ? "Working…" : "Regenerate"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && <div className="text-red-600 text-sm mb-3">{error}</div>}

      <button
        type="button"
        onClick={approveAll}
        disabled={approving}
        className="px-6 py-3 bg-black text-white rounded text-lg disabled:opacity-50"
      >
        {approving ? "Sending…" : "Approve all & generate pages"}
      </button>
    </div>
  );
}
