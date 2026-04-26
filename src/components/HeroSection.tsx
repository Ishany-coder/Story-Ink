export default function HeroSection() {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="animate-bounce-in relative">
        <h1 className="font-[family-name:var(--font-display)] text-5xl font-bold leading-[1.1] tracking-tight sm:text-7xl lg:text-8xl">
          <span className="bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 bg-clip-text text-transparent">
            Storybooks
          </span>
          <br />
          <span className="bg-gradient-to-r from-blue-500 via-cyan-400 to-green-400 bg-clip-text text-transparent">
            about your pet.
          </span>
        </h1>
        <div className="absolute -right-8 -top-6 animate-wiggle text-5xl sm:-right-12 sm:text-6xl">
          &#128062;
        </div>
        <div className="absolute -left-6 bottom-0 animate-float text-4xl sm:-left-10 sm:text-5xl">
          &#128218;
        </div>
      </div>

      <p className="max-w-xl text-base font-semibold leading-relaxed text-purple-400 sm:text-lg">
        Upload a few photos of{" "}
        <span className="font-[family-name:var(--font-display)] font-bold text-purple-600">
          your dog, your cat, your bird, your bunny
        </span>{" "}
        — pick a starter, and we&apos;ll turn them into the hero of an
        illustrated storybook. Living adventures or memorial keepsakes.
      </p>
    </div>
  );
}
