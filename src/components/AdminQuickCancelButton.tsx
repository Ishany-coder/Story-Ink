"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

// Inline-row cancel control for the admin /orders queue. Uses
// window.confirm so it stays compact in the table — the slot next to
// "View" doesn't have room for an inline two-step UI. The full confirm
// flow on the order detail still uses an inline panel.

export default function AdminQuickCancelButton({
  orderId,
}: {
  orderId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function fire() {
    if (pending) return;
    if (!window.confirm("Are you sure you want to cancel this order?")) return;
    setPending(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "cancelled",
          note: "Cancelled by admin from queue.",
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        window.alert(body.error || "Cancel failed");
        setPending(false);
        return;
      }
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Cancel failed");
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={fire}
      disabled={pending}
      title="Cancel order"
      aria-label="Cancel order"
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-200 bg-cream-50 text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
