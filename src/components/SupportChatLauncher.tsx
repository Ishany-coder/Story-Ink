"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send } from "lucide-react";

// User-side support chat. Renders a "Help" pill in the navbar; when
// clicked, opens a fixed-position chat panel anchored to the
// bottom-right. Polls every 5s while open for new messages, and
// every 30s while closed for an unread-admin-message indicator
// (the blue dot).
//
// Auth-gated upstream: parent only renders this when there's a
// signed-in user.

interface Message {
  id: string;
  sender: "user" | "admin";
  body: string;
  created_at: string;
}

const POLL_OPEN_MS = 5_000;
const POLL_CLOSED_MS = 30_000;

export default function SupportChatLauncher() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Closed-state unread polling. Runs whenever the panel is closed
  // so the blue dot stays in sync without holding the whole thread
  // in memory.
  useEffect(() => {
    if (open) return;
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch("/api/support/unread", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { unread?: boolean };
        if (!cancelled) setHasUnread(!!data.unread);
      } catch {
        /* swallow */
      }
    };
    check();
    const id = setInterval(check, POLL_CLOSED_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open]);

  const loadThread = useCallback(async () => {
    try {
      const res = await fetch("/api/support", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: Message[] };
      setMessages(data.messages ?? []);
      // Opening the panel also clears unread (the API marks read).
      setHasUnread(false);
    } catch (err) {
      console.warn("[support] load failed:", err);
    }
  }, []);

  // Open-state message polling.
  useEffect(() => {
    if (!open) return;
    loadThread();
    const id = setInterval(loadThread, POLL_OPEN_MS);
    return () => clearInterval(id);
  }, [open, loadThread]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/support/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "Couldn't send");
      }
      setDraft("");
      // Fetch updated messages immediately so the user sees their
      // own bubble appear without waiting for the next poll.
      await loadThread();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close help chat" : "Open help chat"}
        className="relative hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-ink-500 transition-colors hover:bg-cream-200 hover:text-ink-900 sm:inline-flex"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        Help
        {hasUnread && !open && (
          <span
            aria-label="Unread admin reply"
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-moss-700 ring-2 ring-cream-100"
          />
        )}
      </button>

      {open && (
        <div className="fixed inset-x-0 bottom-0 z-50 sm:inset-x-auto sm:bottom-6 sm:right-6">
          <div className="mx-auto flex h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-cream-300 bg-cream-50 shadow-2xl sm:h-[520px] sm:rounded-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-cream-200 bg-cream-100 px-4 py-3">
              <div>
                <div className="font-[family-name:var(--font-display)] text-base font-semibold text-ink-900">
                  We're here to help
                </div>
                <p className="text-[11px] text-ink-500">
                  Type a question — replies usually within a day.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-full p-1 text-ink-500 hover:bg-cream-200 hover:text-ink-900"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div
              ref={scrollRef}
              className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
            >
              {messages.length === 0 ? (
                <p className="mt-6 text-center text-sm text-ink-300">
                  No messages yet. Say hi 👋
                </p>
              ) : (
                messages.map((m) => <Bubble key={m.id} message={m} />)
              )}
            </div>

            <form
              onSubmit={sendMessage}
              className="flex items-end gap-2 border-t border-cream-200 bg-cream-100 px-3 py-3"
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage(e as unknown as React.FormEvent);
                  }
                }}
                rows={2}
                maxLength={4000}
                placeholder="Type your message…"
                className="flex-1 resize-none rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-ink-900 placeholder-ink-300 focus:border-moss-700 focus:outline-none focus:ring-2 focus:ring-moss-100"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                aria-label="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-moss-700 text-cream-50 transition-colors hover:bg-moss-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            {error && (
              <p className="bg-rose-50 px-4 py-2 text-[11px] font-medium text-rose-600">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Bubble({ message }: { message: Message }) {
  const fromUser = message.sender === "user";
  return (
    <div
      className={`flex ${fromUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
          fromUser
            ? "bg-moss-700 text-cream-50"
            : "bg-cream-200 text-ink-900"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <p
          className={`mt-1 text-[10px] ${
            fromUser ? "text-cream-100/80" : "text-ink-500"
          }`}
        >
          {new Date(message.created_at).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}
