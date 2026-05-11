"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

// Admin /admin/support inbox. Three regions:
//   - Right rail: list of every support thread, newest first, blue
//     dot on threads with unread customer messages.
//   - Main panel: messages for the selected thread, oldest at top.
//   - Bottom: reply box that posts as sender='admin'.
//
// Polls the thread list every 10s and the open conversation every
// 5s. Read-receipts on the admin side fire on thread open (the
// per-thread GET endpoint updates admin_last_read_at).

interface ThreadSummary {
  id: string;
  userId: string;
  email: string | null;
  createdAt: string;
  lastMessageAt: string;
  lastMessage: {
    sender: "user" | "admin";
    body: string;
    createdAt: string;
  } | null;
  unread: boolean;
}

interface Message {
  id: string;
  sender: "user" | "admin";
  body: string;
  created_at: string;
}

const POLL_LIST_MS = 10_000;
const POLL_CONV_MS = 5_000;

export default function AdminSupportInbox() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const convScrollRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/support", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { threads?: ThreadSummary[] };
      const list = data.threads ?? [];
      setThreads(list);
      // Default selection: first thread (already sorted by recency).
      setSelectedId((prev) => prev ?? list[0]?.id ?? null);
    } catch (err) {
      console.warn("[admin/support] list failed:", err);
    }
  }, []);

  const loadConversation = useCallback(async (threadId: string) => {
    try {
      const res = await fetch(`/api/admin/support/${threadId}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: Message[] };
      setMessages(data.messages ?? []);
    } catch (err) {
      console.warn("[admin/support] conv failed:", err);
    }
  }, []);

  // Thread-list polling.
  useEffect(() => {
    loadThreads();
    const id = setInterval(loadThreads, POLL_LIST_MS);
    return () => clearInterval(id);
  }, [loadThreads]);

  // Conversation polling — reset interval when selection changes.
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    loadConversation(selectedId);
    const id = setInterval(() => loadConversation(selectedId), POLL_CONV_MS);
    return () => clearInterval(id);
  }, [selectedId, loadConversation]);

  // Auto-scroll on new messages.
  useEffect(() => {
    const el = convScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/support/${selectedId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "Reply failed");
      }
      setDraft("");
      await loadConversation(selectedId);
      await loadThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reply failed");
    } finally {
      setSending(false);
    }
  }

  const selectedThread = threads.find((t) => t.id === selectedId);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 border-b border-cream-300 pb-3">
        <span className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
          Admin
        </span>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink-900">
          Support
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Customer chat threads. Blue dot means there&apos;s an unread message
          from the user.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Conversation panel (LEFT on desktop) */}
        <section className="order-2 flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 lg:order-1">
          {selectedThread ? (
            <>
              <header className="border-b border-cream-200 bg-cream-100 px-5 py-3">
                <div className="text-sm font-semibold text-ink-900">
                  {selectedThread.email ?? "(unknown email)"}
                </div>
                <div className="font-mono text-[11px] text-ink-300">
                  {selectedThread.userId}
                </div>
              </header>
              <div
                ref={convScrollRef}
                className="flex-1 space-y-3 overflow-y-auto px-5 py-4"
              >
                {messages.length === 0 ? (
                  <p className="mt-6 text-center text-sm text-ink-300">
                    No messages yet in this thread.
                  </p>
                ) : (
                  messages.map((m) => (
                    <Bubble key={m.id} message={m} />
                  ))
                )}
              </div>
              <form
                onSubmit={sendReply}
                className="flex items-end gap-2 border-t border-cream-200 bg-cream-100 px-3 py-3"
              >
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendReply(e as unknown as React.FormEvent);
                    }
                  }}
                  rows={2}
                  maxLength={4000}
                  placeholder="Reply…"
                  className="flex-1 resize-none rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-ink-900 placeholder-ink-300 focus:border-moss-700 focus:outline-none focus:ring-2 focus:ring-moss-100"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  aria-label="Send reply"
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
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <p className="text-sm text-ink-300">
                Pick a thread from the right to start replying.
              </p>
            </div>
          )}
        </section>

        {/* Thread list (RIGHT on desktop) */}
        <aside className="order-1 lg:order-2">
          <div className="rounded-2xl border border-cream-300 bg-cream-50 p-2">
            {threads.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-300">
                No support threads yet.
              </p>
            ) : (
              <ul className="space-y-1">
                {threads.map((t) => {
                  const active = t.id === selectedId;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        className={`relative w-full rounded-xl px-3 py-2.5 text-left transition-colors ${
                          active
                            ? "bg-ink-900 text-cream-50"
                            : "hover:bg-cream-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`truncate text-sm font-medium ${
                              active ? "text-cream-50" : "text-ink-900"
                            }`}
                          >
                            {t.email ?? "(unknown)"}
                          </span>
                          {t.unread && (
                            <span
                              aria-label="Unread"
                              className="mt-1 h-2 w-2 shrink-0 rounded-full bg-moss-700"
                            />
                          )}
                        </div>
                        <p
                          className={`mt-0.5 truncate text-[11px] ${
                            active ? "text-cream-200" : "text-ink-500"
                          }`}
                        >
                          {t.lastMessage
                            ? `${t.lastMessage.sender === "admin" ? "You: " : ""}${t.lastMessage.body.slice(0, 60)}`
                            : "No messages yet"}
                        </p>
                        <p
                          className={`mt-0.5 text-[10px] ${
                            active ? "text-cream-300" : "text-ink-300"
                          }`}
                        >
                          {new Date(t.lastMessageAt).toLocaleString()}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Bubble({ message }: { message: Message }) {
  const fromAdmin = message.sender === "admin";
  return (
    <div className={`flex ${fromAdmin ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
          fromAdmin
            ? "bg-moss-700 text-cream-50"
            : "bg-cream-200 text-ink-900"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <p
          className={`mt-1 text-[10px] ${
            fromAdmin ? "text-cream-100/80" : "text-ink-500"
          }`}
        >
          {new Date(message.created_at).toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}
