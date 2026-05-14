import { isBetaTesting } from "@/lib/beta-flag";

// Compact hero. No emoji. Editorial-magazine voice: short, declarative,
// confident. The single thin gold rule under the kicker is the only
// decoration and reads as "imprint mark" rather than "kids' app sparkle."

export default function HeroSection() {
  // During closed beta, both digital and hardcover purchase surfaces
  // are paused (reading is auto-unlocked, hardcover is 404'd) — so
  // showing a price would be misleading. Outside beta, surface the
  // headline pricing inline so first-time visitors aren't surprised
  // at checkout. See AGENTS.md / beta-flag.ts for the gate's full
  // surface area.
  const showPricing = !isBetaTesting();
  return (
    <div className="animate-rise-in flex flex-col items-center gap-5 text-center">
      <div className="flex flex-col items-center gap-2">
        <span className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
          The fine art of pet storytelling
        </span>
        <span className="block h-px w-12 bg-gold-500" />
      </div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
        Storybooks{" "}
        <em className="font-normal italic text-moss-700">starring your pet.</em>
      </h1>
      <p className="max-w-xl text-sm leading-relaxed text-ink-500 sm:text-base lg:text-lg">
        Hand-illustrated keepsakes built from your photos. Living
        adventures or Rainbow Bridge memorials, printed as museum-grade
        hardcovers.
      </p>
      {showPricing && (
        <p className="max-w-xl text-xs leading-relaxed text-ink-300 sm:text-sm">
          Read online or download for $9.99. Hardcover keepsakes from $34.99.
        </p>
      )}
    </div>
  );
}
