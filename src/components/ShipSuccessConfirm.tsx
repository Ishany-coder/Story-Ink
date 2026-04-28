"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Posts the Stripe session id to /api/ship/stripe/confirm exactly once on
// mount. The endpoint is idempotent — if the user refreshes, we'll surface
// the already-created Lulu job instead of double-shipping.

interface Props {
  storyId: string;
  sessionId: string;
}

type State =
  | { kind: "loading" }
  | {
      kind: "success";
      orderId: string;
      luluJobId: string;
      alreadyProcessed?: boolean;
    }
  | { kind: "error"; message: string };

export default function ShipSuccessConfirm({ storyId, sessionId }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  // Ref guard so Strict Mode's double-mount doesn't fire the confirm twice
  // in dev (the endpoint is idempotent, but this keeps the UI stable).
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    (async () => {
      try {
        const res = await fetch("/api/ship/stripe/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          orderId?: string;
          luluJobId?: string;
          error?: string;
          alreadyProcessed?: boolean;
        };
        if (!res.ok) {
          throw new Error(body.error || "Confirm failed");
        }
        setState({
          kind: "success",
          orderId: body.orderId ?? "",
          luluJobId: body.luluJobId ?? "",
          alreadyProcessed: body.alreadyProcessed,
        });
      } catch (err) {
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Confirm failed",
        });
      }
    })();
  }, [sessionId]);

  return (
    <div className="animate-rise-in mx-auto max-w-xl px-4 py-12">
      {state.kind === "loading" && (
        <div className="rounded-2xl border border-cream-300 bg-cream-50 p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <Spinner />
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            Finalizing your order
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Building the print files and handing them to Lulu. Don&apos;t
            close this page.
          </p>
        </div>
      )}

      {state.kind === "success" && (
        <div className="rounded-2xl border border-emerald-200 bg-cream-50 p-8 text-center shadow-[0_8px_24px_rgba(16,185,129,0.08)]">
          <CheckmarkCircle />
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-semibold text-ink-900">
            Your book is on its way
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            {state.alreadyProcessed
              ? "This order was already submitted. Here are the details:"
              : "We've handed your order to the print partner."}
          </p>
          <div className="mt-6 space-y-1 rounded-xl bg-cream-100 px-4 py-3 text-left text-xs text-ink-500">
            <div>
              Order ID:{" "}
              <span className="font-mono text-[11px] text-ink-900">
                {state.orderId || "—"}
              </span>
            </div>
            <div>
              Print job:{" "}
              <span className="font-mono text-[11px] text-ink-900">
                {state.luluJobId || "—"}
              </span>
            </div>
          </div>
          <div className="mt-6">
            <Link
              href={`/read/${storyId}`}
              className="rounded-full bg-moss-700 px-6 py-2.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
            >
              Back to story
            </Link>
          </div>
        </div>
      )}

      {state.kind === "error" && (
        <div className="rounded-2xl border border-rose-200 bg-cream-50 p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            Something went wrong finalizing your order
          </h1>
          <p className="mt-2 text-sm text-rose-600">{state.message}</p>
          <p className="mt-3 text-xs text-ink-500">
            Your card may or may not have been charged. Support can look up
            Stripe session {sessionId.slice(0, 14)}…
          </p>
          <Link
            href={`/ship/${storyId}`}
            className="mt-6 inline-block rounded-full border border-cream-300 bg-cream-50 px-5 py-2 text-sm font-medium text-ink-700 hover:bg-cream-100"
          >
            Try again
          </Link>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="inline-block h-10 w-10"
      style={{ animation: "spin 1.1s linear infinite" }}
    >
      <svg viewBox="0 0 40 40" fill="none" className="h-full w-full">
        <circle cx="20" cy="20" r="15" stroke="#ebe4d3" strokeWidth="3.5" />
        <path
          d="M20 5 a15 15 0 0 1 15 15"
          stroke="#1f3d2e"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function CheckmarkCircle() {
  return (
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </div>
  );
}
