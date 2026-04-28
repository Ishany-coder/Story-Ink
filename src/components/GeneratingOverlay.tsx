interface Props {
  progress?: { current: number; total: number } | null;
}

// Modal-style loading overlay shown while the Inngest pipeline runs.
// Editorial + restrained: a quiet ring spinner, deep navy heading,
// and a moss progress bar that fills as pages render.
export default function GeneratingOverlay({ progress = null }: Props) {
  const pct = progress
    ? Math.min(
        100,
        Math.round((progress.current / Math.max(progress.total, 1)) * 100)
      )
    : null;

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex flex-col items-center justify-center bg-cream-100/92 backdrop-blur-md">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-3xl border border-cream-300 bg-cream-50 px-8 py-10 shadow-[0_24px_60px_rgba(14,26,43,0.10)]">
        <SpinnerRing />

        <div className="text-center">
          <p className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            Building your storybook
          </p>
          <p className="mt-1 text-sm text-ink-500">
            {progress
              ? `Drawing page ${progress.current} of ${progress.total}…`
              : "This usually takes a minute or two."}
          </p>
        </div>

        {pct !== null && (
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-cream-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div
              className="h-full rounded-full bg-moss-700 transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        {pct === null && (
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-moss-700"
                style={{
                  animation: "bounce-dot 1.4s ease-in-out infinite",
                  animationDelay: `${i * 0.16}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Indeterminate ring spinner with a soft cream track + a single
// moss arc tip. Champagne gold inner dot reads as a small "imprint."
function SpinnerRing() {
  return (
    <div
      className="relative h-12 w-12"
      style={{ animation: "spin 1.1s linear infinite" }}
    >
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        <circle cx="24" cy="24" r="18" stroke="#ebe4d3" strokeWidth="4" />
        <path
          d="M24 6 a18 18 0 0 1 18 18"
          stroke="#1f3d2e"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
