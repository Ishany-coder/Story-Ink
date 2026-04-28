interface Props {
  progress?: { current: number; total: number } | null;
}

// Modal-style loading overlay shown while the Inngest pipeline runs.
// No emojis, no wiggle. A clean spinner ring + a determinate progress
// bar when the worker has reported a current/total page.
export default function GeneratingOverlay({ progress = null }: Props) {
  const pct = progress
    ? Math.min(
        100,
        Math.round((progress.current / Math.max(progress.total, 1)) * 100)
      )
    : null;

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex flex-col items-center justify-center bg-stone-50/90 backdrop-blur-md">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-3xl border border-stone-200 bg-white px-8 py-10 shadow-xl shadow-stone-300/30">
        <SpinnerRing />

        <div className="text-center">
          <p className="font-[family-name:var(--font-display)] text-xl font-semibold text-slate-900">
            Building your storybook
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {progress
              ? `Drawing page ${progress.current} of ${progress.total}…`
              : "This usually takes a minute or two."}
          </p>
        </div>

        {pct !== null && (
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-600 to-pink-600 transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        {pct === null && (
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-purple-500"
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

// Indeterminate ring spinner with a soft track + a single-arc tip in
// the brand gradient. CSS-only, no extra deps.
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
        <defs>
          <linearGradient id="spinner-grad" x1="0" y1="0" x2="48" y2="48">
            <stop offset="0%" stopColor="#9333ea" />
            <stop offset="100%" stopColor="#db2777" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="18" stroke="#f0eadf" strokeWidth="4" />
        <path
          d="M24 6 a18 18 0 0 1 18 18"
          stroke="url(#spinner-grad)"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
