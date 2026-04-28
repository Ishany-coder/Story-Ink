// Compact hero. No floating decorations or sparkle emojis — the
// brand voice now reads "thoughtful gift" rather than "kids' app."
// Two-line headline with a single restrained gradient on the verb,
// subline that names the audience.

export default function HeroSection() {
  return (
    <div className="animate-rise-in flex flex-col items-center gap-4 text-center">
      <span className="rounded-full border border-stone-300 bg-white/70 px-3 py-1 text-xs font-medium uppercase tracking-wider text-slate-500">
        For pet owners
      </span>
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl">
        Storybooks{" "}
        <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
          starring your pet.
        </span>
      </h1>
      <p className="max-w-xl text-base leading-relaxed text-slate-500 sm:text-lg">
        Upload a few photos, pick a starter, and we&rsquo;ll turn your dog,
        cat, or rabbit into the hero of an illustrated keepsake. Living
        adventures or memorial books, printed and shipped.
      </p>
    </div>
  );
}
