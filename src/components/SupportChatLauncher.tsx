"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";

// Help pill in the navbar. Routes differently based on admin status:
//   - Admin → /admin/support (inbox of every user's thread)
//   - User  → /help (their own conversation with the admin)
//
// Polls the matching unread endpoint every 30s so a blue dot appears
// when there's something to act on. Stops polling when the user is
// already on the destination page (nothing to nudge them about).
//
// Auth-gated upstream: parent only renders this when there's a
// signed-in user.

const POLL_MS = 30_000;

export default function SupportChatLauncher({
  isAdmin = false,
}: {
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const destination = isAdmin ? "/admin/support" : "/help";
  const onDestination = pathname?.startsWith(destination) ?? false;
  const unreadEndpoint = isAdmin
    ? "/api/admin/support/unread"
    : "/api/support/unread";

  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    if (onDestination) {
      setHasUnread(false);
      return;
    }
    const ac = new AbortController();
    const check = async () => {
      try {
        const res = await fetch(unreadEndpoint, {
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
  }, [onDestination, unreadEndpoint]);

  return (
    <Link
      href={destination}
      aria-label={isAdmin ? "Customer support inbox" : "Help chat"}
      className={`relative hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors sm:inline-flex ${
        onDestination
          ? "bg-ink-900 text-cream-50"
          : "text-ink-500 hover:bg-cream-200 hover:text-ink-900"
      }`}
    >
      <MessageCircle className="h-3.5 w-3.5" />
      Help
      {hasUnread && !onDestination && (
        <span
          aria-label="Unread message"
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
