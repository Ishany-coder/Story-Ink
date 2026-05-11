"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";

// Help pill in the navbar. Polls /api/support/unread every 30s so a
// blue dot appears when the admin has replied since the user last
// opened /help. The button itself is just a Link — the actual chat
// UI lives on its own page at /help.
//
// Auth-gated upstream: parent only renders this when there's a
// signed-in user.

const POLL_MS = 30_000;

export default function SupportChatLauncher() {
  const pathname = usePathname();
  const onHelpPage = pathname?.startsWith("/help") ?? false;
  const [hasUnread, setHasUnread] = useState(false);

  // Stop polling while the user is on /help — the chat page is
  // already loading + reading messages, no need for the dot.
  useEffect(() => {
    if (onHelpPage) {
      setHasUnread(false);
      return;
    }
    const ac = new AbortController();
    const check = async () => {
      try {
        const res = await fetch("/api/support/unread", {
          cache: "no-store",
          signal: ac.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { unread?: boolean };
        if (!ac.signal.aborted) setHasUnread(!!data.unread);
      } catch (err) {
        if (!isAbortError(err)) {
          console.warn("[support] unread check failed:", err);
        }
      }
    };
    check();
    const id = setInterval(check, POLL_MS);
    return () => {
      ac.abort();
      clearInterval(id);
    };
  }, [onHelpPage]);

  return (
    <Link
      href="/help"
      aria-label="Help chat"
      className={`relative hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors sm:inline-flex ${
        onHelpPage
          ? "bg-ink-900 text-cream-50"
          : "text-ink-500 hover:bg-cream-200 hover:text-ink-900"
      }`}
    >
      <MessageCircle className="h-3.5 w-3.5" />
      Help
      {hasUnread && !onHelpPage && (
        <span
          aria-label="Unread admin reply"
          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-moss-700 ring-2 ring-cream-100"
        />
      )}
    </Link>
  );
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (
    err instanceof TypeError &&
    /aborted|cancel|fail/i.test(err.message)
  ) {
    return true;
  }
  return false;
}
