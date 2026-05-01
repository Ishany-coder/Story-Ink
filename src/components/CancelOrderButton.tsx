"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Customer-side cancel control. Visible only while an order is in
// "received" — we hide it after the admin moves it to in_progress
// since that's when the print vendor's been engaged.
//
// Two-step UX: the first click opens a small confirm panel inline,
// the second click actually fires the request. Keeps the destructive
// action from being a one-click mistake.

export default function CancelOrderButton({
  orderId,
}: {
  orderId: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fire() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/my-orders/${orderId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || "Cancel failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-full border border-rose-200 bg-cream-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50"
      >
        Cancel order
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2">
      <span className="text-xs font-medium text-rose-700">
        Cancel this order?
      </span>
      <button
        type="button"
        onClick={fire}
        disabled={pending}
        className="rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-cream-50 transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Cancelling…" : "Yes, cancel"}
      </button>
      <button
        type="button"
        onClick={() => {
          setConfirming(false);
          setError(null);
        }}
        disabled={pending}
        className="rounded-full border border-cream-300 bg-cream-50 px-3 py-1 text-xs font-medium text-ink-700 hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Keep it
      </button>
      {error && (
        <span className="basis-full text-[11px] font-medium text-rose-600">
          {error}
        </span>
      )}
    </div>
  );
}
