"use client";

import { useEffect, useState } from "react";

// Typed-confirmation deletion modal. Modeled on LegalConsentModal —
// same overlay shape, focus ring, Esc-to-dismiss, scroll lock.
// The "DELETE" string is the same token the API expects, so what
// the user types literally maps to the request body.

interface Props {
  open: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

const REQUIRED = "DELETE";

export default function AccountDeleteModal({ open, onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTyped("");
      setBusy(false);
      setError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onCancel, busy]);

  if (!open) return null;

  async function handleConfirm() {
    if (typed !== REQUIRED || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
      setBusy(false);
    }
  }

  const enabled = typed === REQUIRED && !busy;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-delete-title"
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 px-4 py-8 backdrop-blur-sm"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="animate-rise-in flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-cream-200 px-6 py-4">
          <h2
            id="account-delete-title"
            className="font-[family-name:var(--font-display)] text-xl font-semibold text-rose-700"
          >
            Delete your account
          </h2>
          <p className="mt-1 text-xs text-ink-500">
            This permanently deletes your stories, pets, and pre-payment orders.
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 text-sm leading-relaxed text-ink-700">
          <p>
            This action cannot be undone. We will:
          </p>
          <ul className="ml-5 mt-2 list-disc space-y-1.5">
            <li>Delete all your pets and stories.</li>
            <li>
              Delete any pre-payment orders (cart-style rows that never
              completed checkout).
            </li>
            <li>
              Keep an anonymized record of every order you actually paid
              for — paid, in fulfillment, shipped, delivered, refunded, or
              disputed — so we can complete outstanding shipments and meet
              our tax and Stripe reconciliation obligations. Your address
              and account id are stripped from those rows; only the
              transaction itself remains.
            </li>
            <li>Delete your sign-in account.</li>
          </ul>

          <p className="mt-4">
            To confirm, type{" "}
            <code className="rounded bg-cream-200 px-1.5 py-0.5 text-xs font-semibold text-ink-900">
              {REQUIRED}
            </code>{" "}
            below.
          </p>

          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={REQUIRED}
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="mt-3 w-full rounded-lg border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-ink-900 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
          />
          {error && (
            <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>
          )}
        </div>

        <footer className="border-t border-cream-200 bg-cream-100 px-6 py-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-full px-4 py-2 text-sm font-medium text-ink-500 hover:bg-cream-200 hover:text-ink-900 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!enabled}
              className="rounded-full bg-rose-700 px-5 py-2 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Delete my account"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
