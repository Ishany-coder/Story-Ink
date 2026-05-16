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
  onSkip,
  skipLabel = "Skip",
  nextLabel = "Next",
  nextDisabled,
  nextVariant = "primary",
  editingReview = false,
  onExitReview,
}: {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  onSkip?: () => void;
  skipLabel?: string;
  nextLabel?: string;
  nextDisabled?: boolean;
  // "primary" — standard moss CTA (default).
  // "prominent" — bigger, full-width on mobile, used by step 7 to signal
  // "this is the action that actually creates the book."
  nextVariant?: "primary" | "prominent";
  // When true, a banner is shown signaling the user came from the review
  // step. onExitReview wires the banner's "Back to review" affordance.
  editingReview?: boolean;
  onExitReview?: () => void;
}) {
  const nextClasses =
    nextVariant === "prominent"
      ? "w-full sm:w-auto px-8 py-3 bg-moss-700 text-cream-50 rounded-xl text-base font-semibold shadow-[0_4px_14px_rgba(31,61,46,0.25)] hover:bg-moss-900 transition disabled:opacity-50 disabled:cursor-not-allowed"
      : "px-6 py-2 bg-moss-700 text-cream-50 rounded-xl font-medium hover:bg-moss-900 transition disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div>
      {editingReview && onExitReview && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-gold-300 bg-gold-100/50 px-4 py-2.5">
          <span className="text-sm text-ink-700">
            <span className="font-medium text-gold-900">Editing</span> — changes
            return you to review.
          </span>
          <button
            type="button"
            onClick={onExitReview}
            className="text-sm font-medium text-moss-700 hover:text-moss-900 transition"
          >
            ← Back to review
          </button>
        </div>
      )}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[11px] uppercase tracking-[0.18em] text-ink-300">
            Step {step} of {totalSteps}
          </span>
          <div className="flex-1 h-1 bg-cream-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-moss-700 rounded-full transition-all duration-500"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold text-ink-900 leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-ink-500 mt-2 text-base">{subtitle}</p>
        )}
      </div>

      <div className="mb-8">{children}</div>

      <div
        className={`flex flex-col-reverse gap-3 sm:flex-row sm:items-center ${
          onBack || onSkip ? "sm:justify-between" : "sm:justify-end"
        }`}
      >
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-ink-500 hover:text-ink-900 transition text-sm font-medium"
            >
              ← Back
            </button>
          )}
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="text-ink-500 hover:text-ink-700 transition text-sm font-medium underline-offset-4 hover:underline"
            >
              {skipLabel}
            </button>
          )}
        </div>
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className={nextClasses}
          >
            {nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}
