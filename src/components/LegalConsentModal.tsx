"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// First-time consent gate. Shown the first time a user tries to create
// a story; persisted in localStorage under a versioned key so we can
// re-prompt the user if the policy materially changes (bump the key
// suffix).
//
// localStorage is per-device — this is the v1 approach. If we need
// auditable, durable consent later (e.g. for GDPR proof), migrate the
// stored record to a server-side `legal_acceptance` table keyed by
// user_id.

const STORAGE_KEY = "storyink.legalConsent.v1";

interface StoredConsent {
  version: 1;
  acceptedAt: string; // ISO timestamp
}

// Read once on mount; return null if running on the server or if the
// user hasn't accepted yet.
export function readStoredConsent(): StoredConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (parsed?.version === 1 && typeof parsed.acceptedAt === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// Returns true if the consent record was successfully stored.
function writeStoredConsent(): boolean {
  try {
    const record: StoredConsent = {
      version: 1,
      acceptedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

interface Props {
  open: boolean;
  onAccept: () => void;
  onCancel: () => void;
}

export default function LegalConsentModal({
  open,
  onAccept,
  onCancel,
}: Props) {
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reset the checkbox whenever the modal re-opens, using the
  // "derived state from prop change" pattern. Comparing `open` to a
  // previous-value state slot during render lets React drop the
  // in-progress render and restart with the new state, avoiding the
  // setState-in-effect rule (and the extra paint that pattern
  // produces).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setAgreed(false);
      setError(null);
    }
  }

  // Esc to dismiss. Lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onCancel]);

  if (!open) return null;

  function handleAccept() {
    if (!agreed) {
      setError("Please confirm you've read and agree to continue.");
      return;
    }
    const ok = writeStoredConsent();
    if (!ok) {
      // localStorage failed (private mode / disk full). Surface the
      // failure but still call onAccept so the user can proceed in the
      // current session.
      setError(
        "Couldn't save your consent locally, but you can still continue."
      );
    }
    onAccept();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-consent-title"
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 px-4 py-8 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="animate-rise-in flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-cream-200 px-6 py-4">
          <h2
            id="legal-consent-title"
            className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900"
          >
            Before you create your first story
          </h2>
          <p className="mt-1 text-xs text-ink-500">
            A quick heads-up on how we use your story content and data.
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 text-sm leading-relaxed text-ink-700">
          <p>
            By generating a story you confirm that:
          </p>
          <ul className="ml-5 mt-2 list-disc space-y-1.5">
            <li>
              You&rsquo;re uploading photos and pet details you have the
              right to share, and the story is for personal / family use.
            </li>
            <li>
              Your prompt, pet photos, and pet details are sent to our AI
              provider (Google Gemini) to generate the text and
              illustrations.
            </li>
            <li>
              Story text, generated illustrations, and reference images are
              stored on our servers (Supabase) so you can read, edit, and
              re-print your books later.
            </li>
            <li>
              Generated content is created automatically and may
              occasionally be inaccurate or surprising. Review before
              ordering a printed copy.
            </li>
          </ul>

          <p className="mt-4">
            Full details:{" "}
            <Link
              href="/privacy"
              target="_blank"
              className="font-semibold text-moss-700 underline hover:text-ink-900"
            >
              Privacy Policy
            </Link>
            {"  ·  "}
            <Link
              href="/terms"
              target="_blank"
              className="font-semibold text-moss-700 underline hover:text-ink-900"
            >
              Terms of Service
            </Link>
          </p>
        </div>

        <footer className="border-t border-cream-200 bg-cream-100 px-6 py-4">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-900">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked);
                if (e.target.checked) setError(null);
              }}
              className="mt-0.5 h-4 w-4 shrink-0 accent-moss-700"
            />
            <span>
              I&rsquo;ve read and agree to the Privacy Policy and Terms of
              Service.
            </span>
          </label>
          {error && (
            <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-4 py-2 text-sm font-medium text-ink-500 hover:bg-cream-200 hover:text-ink-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAccept}
              disabled={!agreed}
              className="rounded-full bg-moss-700 px-5 py-2 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Agree and continue
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
