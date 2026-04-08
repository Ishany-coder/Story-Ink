export default function HeroSection() {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="animate-bounce-in relative">
        <h1 className="font-[family-name:var(--font-display)] text-6xl font-bold leading-[1.1] tracking-tight sm:text-8xl lg:text-9xl">
          <span className="bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 bg-clip-text text-transparent">
            Make Your
          </span>
          <br />
          <span className="bg-gradient-to-r from-blue-500 via-cyan-400 to-green-400 bg-clip-text text-transparent">
            Own Story!
          </span>
        </h1>
        <div className="absolute -right-8 -top-6 animate-wiggle text-5xl sm:-right-12 sm:text-6xl">
          &#128218;
        </div>
        <div className="absolute -left-6 bottom-0 animate-float text-4xl sm:-left-10 sm:text-5xl">
          &#127912;
        </div>
      </div>

      <p className="max-w-lg text-lg font-semibold leading-relaxed text-purple-400 sm:text-xl">
        <span className="font-[family-name:var(--font-display)] text-2xl font-bold text-purple-600 sm:text-3xl">
          StoryInk
        </span>
        <br />
        Tell us your idea and we&apos;ll turn it into
        <br className="hidden sm:block" />
        an amazing storybook with pictures! &#127752;
      </p>
    </div>
  );
}
