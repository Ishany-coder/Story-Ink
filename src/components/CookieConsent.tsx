"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";

// Cookie consent banner. Bottom-of-screen, persists choice in
// localStorage under a versioned key so we can re-prompt the user if
// the policy materially changes (bump the key suffix).
//
// What's NOT here:
//   - We don't try to enumerate every cookie. Essential session cookies
//     (Supabase auth refresh) are always set regardless of consent —
//     those are necessary for the site to function and aren't governed
//     by the cookie-consent regime. The "Accept" path opts INTO
//     non-essential tracking (Sentry session replay, future analytics).
//   - We don't ship a per-category granular UI. Accept / Reject is the
//     baseline GDPR-acceptable shape; if we add categories later, bump
//     the version key so existing users see the new banner.

const STORAGE_KEY = "storyink.cookieConsent.v1";

type Choice = "accepted" | "rejected";

interface StoredConsent {
  version: 1;
  choice: Choice;
  decidedAt: string;
}

function readStoredConsent(): StoredConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (
      parsed?.version === 1 &&
      (parsed.choice === "accepted" || parsed.choice === "rejected") &&
      typeof parsed.decidedAt === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStoredConsent(choice: Choice): void {
  try {
    const record: StoredConsent = {
      version: 1,
      choice,
      decidedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // localStorage failed (private browsing / disk full). The banner
    // will re-appear on next load — acceptable degradation.
  }
}

// Public helper. Returns true when the user has accepted, false
// otherwise (rejected OR not yet decided OR running on the server).
// Other code should gate non-essential tracking on this.
export function hasCookieConsent(): boolean {
  if (typeof window === "undefined") return false;
  return readStoredConsent()?.choice === "accepted";
}

// useSyncExternalStore lets us read localStorage in a SSR-safe way
// without setState-in-effect. The subscribe function listens for
// `storage` events so a choice made in another tab clears the banner
// here too. The server snapshot returns true (already-decided) so
// SSR never emits the banner — the post-hydration client snapshot
// decides whether to show it.
function subscribeStorage(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

function getClientHasDecided(): boolean {
  return readStoredConsent() !== null;
}

function getServerHasDecided(): boolean {
  return true;
}

export default function CookieConsent() {
  const hasDecided = useSyncExternalStore(
    subscribeStorage,
    getClientHasDecided,
    getServerHasDecided
  );
  const [dismissed, setDismissed] = useState(false);

  if (hasDecided || dismissed) return null;

  function decide(choice: Choice) {
    writeStoredConsent(choice);
    setDismissed(true);
  }

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="animate-rise-in fixed inset-x-0 bottom-0 z-40 border-t border-cream-300 bg-cream-50/95 px-4 py-4 shadow-[0_-8px_24px_rgba(14,26,43,0.08)] backdrop-blur sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <p className="text-xs leading-relaxed text-ink-700 sm:text-sm">
          We use a small number of essential cookies to keep you signed
          in. Accept to allow optional cookies (error monitoring, usage
          analytics) that help us improve the site. See our{" "}
          <Link
            href="/privacy"
            className="font-semibold text-moss-700 underline hover:text-moss-900"
          >
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={() => decide("rejected")}
            className="inline-flex items-center gap-1.5 rounded-full border border-cream-300 bg-cream-50 px-3 py-1.5 text-xs font-semibold text-ink-700 shadow-sm transition-colors hover:bg-cream-100 hover:border-cream-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => decide("accepted")}
            className="inline-flex items-center gap-1.5 rounded-full bg-moss-700 px-3 py-1.5 text-xs font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

// Clear the stored choice and reload, so the banner reappears. Used by
// the "Cookie settings" footer link.
export function resetCookieConsent(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") window.location.reload();
}
