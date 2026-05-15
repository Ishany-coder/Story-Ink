"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import GeneratingOverlay from "./GeneratingOverlay";
import { useJobPolling } from "@/lib/useJobPolling";

interface Props {
  jobId: string;
}

export default function StoryGeneratingScreen({ jobId }: Props) {
  const router = useRouter();
  const { state, start } = useJobPolling<{ storyId: string }>();

  useEffect(() => {
    start(jobId);
  }, [jobId, start]);

  useEffect(() => {
    if (state.kind === "done") {
      router.replace(`/read/${state.result.storyId}?fresh=1`);
    }
  }, [state, router]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const progress = useMemo(() => {
    if (state.kind !== "running" || !state.result) return null;
    const value = state.result as Partial<{ current: number; total: number }>;
    if (typeof value.current !== "number" || typeof value.total !== "number") {
      return null;
    }
    return { current: value.current, total: value.total };
  }, [state]);

  if (state.kind === "failed" || state.kind === "stalled") {
    const message =
      state.kind === "failed"
        ? state.error
        : "Your story is taking longer than expected. It'll appear on your home page when it's ready — feel free to leave this tab.";
    return (
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="w-full rounded-3xl border border-cream-300 bg-cream-50 px-6 py-8 text-center shadow-[0_24px_60px_rgba(14,26,43,0.10)]">
          <p className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            Couldn&rsquo;t finish building your storybook
          </p>
          <p className="mt-2 text-sm text-ink-500">{message}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/create"
              className="rounded-full bg-moss-700 px-5 py-2 text-sm font-semibold text-cream-50 transition-colors hover:bg-moss-900"
            >
              Back to create
            </Link>
            <Link
              href="/read"
              className="rounded-full border border-cream-300 bg-cream-50 px-5 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-moss-500 hover:text-moss-700"
            >
              Go to my library
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-hidden">
      <GeneratingOverlay progress={progress} />
    </div>
  );
}
