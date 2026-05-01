"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Buttons that move an order through the fulfillment state machine.
// The valid next states for the current status come from the same
// transition table the API enforces — keep them in sync. Server is
// the authority; this UI just hides invalid transitions to keep the
// admin from clicking something that would 409.

interface Props {
  orderId: string;
  currentStatus: string;
}

const ACTIONS: Record<
  string,
  ReadonlyArray<{ next: string; label: string; tone: "primary" | "danger" }>
> = {
  received: [
    { next: "in_progress", label: "Mark in progress", tone: "primary" },
    { next: "failed", label: "Mark failed", tone: "danger" },
  ],
  in_progress: [
    { next: "shipped", label: "Mark shipped", tone: "primary" },
    { next: "failed", label: "Mark failed", tone: "danger" },
  ],
  shipped: [
    { next: "delivered", label: "Mark delivered", tone: "primary" },
    { next: "failed", label: "Mark failed", tone: "danger" },
  ],
  delivered: [],
  failed: [{ next: "received", label: "Retry — back to received", tone: "primary" }],
};

export default function OrderStatusActions({
  orderId,
  currentStatus,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const actions = ACTIONS[currentStatus] ?? [];

  async function fire(next: string) {
    setPending(next);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: next,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || "Status update failed");
      }
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setPending(null);
    }
  }

  if (actions.length === 0) {
    return (
      <p className="text-xs text-ink-500">
        No further moves — this order is in a terminal state.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Optional note (vendor confirmation #, tracking, etc.)"
        className="w-full resize-none rounded-lg border border-cream-300 bg-cream-50 px-3 py-2 text-xs text-ink-900 placeholder-ink-300 transition focus:border-moss-700 focus:outline-none focus:ring-4 focus:ring-moss-100/60"
      />

      <div className="space-y-2">
        {actions.map((a) => {
          const isPending = pending === a.next;
          const cls =
            a.tone === "primary"
              ? "bg-moss-700 text-cream-50 hover:bg-moss-900"
              : "border border-rose-200 bg-cream-50 text-rose-600 hover:bg-rose-50";
          return (
            <button
              key={a.next}
              type="button"
              onClick={() => fire(a.next)}
              disabled={pending !== null}
              className={`w-full rounded-full px-4 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}
            >
              {isPending ? "Working…" : a.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="text-xs font-medium text-rose-600">{error}</p>
      )}
    </div>
  );
}
