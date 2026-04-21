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
    <div className="mx-auto max-w-xl px-4 py-12">
      {state.kind === "loading" && (
        <div className="rounded-3xl border-4 border-purple-200 bg-white p-8 text-center shadow-sm">
          <div className="mb-3 text-4xl">&#128230;</div>
          <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-purple-700">
            Finalizing your order…
          </h1>
          <p className="mt-2 text-sm font-bold text-purple-400">
            Building the print files and handing them to Lulu. Don&apos;t
            close this page.
          </p>
        </div>
      )}

      {state.kind === "success" && (
        <div className="rounded-3xl border-4 border-emerald-300 bg-emerald-50 p-8 text-center shadow-lg shadow-emerald-100">
          <div className="mb-2 text-5xl">&#127881;</div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-emerald-700">
            Your book is on its way!
          </h1>
          <p className="mt-2 text-sm font-bold text-emerald-600">
            {state.alreadyProcessed
              ? "This order was already submitted. Here are the details:"
              : "We've handed your order to the print partner."}
          </p>
          <div className="mt-6 space-y-1 rounded-2xl bg-white px-4 py-3 text-left text-xs font-bold text-emerald-700">
            <div>
              Order ID:{" "}
              <span className="font-mono text-[11px]">
                {state.orderId || "—"}
              </span>
            </div>
            <div>
              Print job:{" "}
              <span className="font-mono text-[11px]">
                {state.luluJobId || "—"}
              </span>
            </div>
          </div>
          <div className="mt-6">
            <Link
              href={`/read/${storyId}`}
              className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-black uppercase text-white hover:bg-emerald-600"
            >
              Back to story
            </Link>
          </div>
        </div>
      )}

      {state.kind === "error" && (
        <div className="rounded-3xl border-4 border-rose-300 bg-rose-50 p-8 text-center shadow-lg">
          <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-rose-700">
            Something went wrong finalizing your order
          </h1>
          <p className="mt-2 text-sm font-bold text-rose-600">{state.message}</p>
          <p className="mt-3 text-[11px] font-bold text-rose-400">
            Your card may or may not have been charged. Support can look up
            Stripe session {sessionId.slice(0, 14)}…
          </p>
          <Link
            href={`/ship/${storyId}`}
            className="mt-6 inline-block rounded-2xl bg-rose-500 px-5 py-2 text-sm font-black uppercase text-white hover:bg-rose-600"
          >
            Try again
          </Link>
        </div>
      )}
    </div>
  );
}
