"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

// Full-page customer support chat. Lives at /help. Polls every 5s
// for new messages, auto-scrolls to the latest, and posts new
// messages via /api/support/message.

interface Message {
  id: string;
  sender: "user" | "admin";
  body: string;
  created_at: string;
}

const POLL_MS = 5_000;

export default function HelpChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadThread = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/support", {
        cache: "no-store",
        signal,
      });
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: Message[] };
      if (signal?.aborted) return;
      setMessages(data.messages ?? []);
    } catch (err) {
      if (!isAbortError(err)) {
        console.warn("[help] load failed:", err);
      }
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    loadThread(ac.signal);
    const id = setInterval(() => loadThread(ac.signal), POLL_MS);
    return () => {
      ac.abort();
      clearInterval(id);
    };
  }, [loadThread]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

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
      await loadThread();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem-3rem)] max-w-3xl flex-col px-4 sm:px-6 lg:px-8 py-6">
      <header className="mb-4 border-b border-cream-300 pb-3">
        <span className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
          Help
        </span>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink-900">
          We&apos;re here for you
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Type a question below. Replies usually arrive within a day —
          you&apos;ll see them here as soon as we respond.
        </p>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-cream-300 bg-cream-50 px-4 py-4 sm:px-6 sm:py-5"
      >
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-ink-300">
            No messages yet. Say hi 👋
          </p>
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} />)
        )}
      </div>

      <form
        onSubmit={sendMessage}
        className="mt-3 flex items-end gap-2 rounded-2xl border border-cream-300 bg-cream-50 px-3 py-3"
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
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-moss-700 text-cream-50 transition-colors hover:bg-moss-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      {error && (
        <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>
      )}
    </div>
  );
}

function Bubble({ message }: { message: Message }) {
  const fromUser = message.sender === "user";
  return (
    <div className={`flex ${fromUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
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
