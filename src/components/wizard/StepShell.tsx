"use client";

import type { ReactNode } from "react";

export default function StepShell({
  step,
  totalSteps,
  title,
  subtitle,
  children,
  onBack,
  onNext,
  nextLabel = "Next",
  nextDisabled,
}: {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs uppercase tracking-wide text-stone-500">
            Step {step} of {totalSteps}
          </span>
          <div className="flex-1 h-1 bg-stone-200 rounded">
            <div
              className="h-1 bg-black rounded"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="text-stone-600 mt-1">{subtitle}</p>}
      </div>

      <div className="mb-8">{children}</div>

      <div className="flex items-center justify-between">
        {onBack ? (
          <button type="button" onClick={onBack} className="px-4 py-2 underline">
            ← Back
          </button>
        ) : (
          <span />
        )}
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className="px-6 py-2 bg-black text-white rounded disabled:opacity-50"
          >
            {nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}
