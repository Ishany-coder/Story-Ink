// Compact hero. No emoji. Editorial-magazine voice: short, declarative,
// confident. The single thin gold rule under the kicker is the only
// decoration and reads as "imprint mark" rather than "kids' app sparkle."

export default function HeroSection() {
  return (
    <div className="animate-rise-in flex flex-col items-center gap-5 text-center">
      <div className="flex flex-col items-center gap-2">
        <span className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
          The fine art of pet storytelling
        </span>
        <span className="block h-px w-12 bg-gold-500" />
      </div>
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-6xl">
        Storybooks{" "}
        <em className="font-normal italic text-moss-700">starring your pet.</em>
      </h1>
      <p className="max-w-xl text-base leading-relaxed text-ink-500 sm:text-lg">
        Hand-illustrated keepsakes built from your photos. Living
        adventures or Rainbow Bridge memorials, printed as museum-grade
        hardcovers.
      </p>
    </div>
  );
}
