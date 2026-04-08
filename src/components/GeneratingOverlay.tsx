export default function GeneratingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#fffbf5]/95 backdrop-blur-md">
      <div className="flex flex-col items-center gap-6">
        {/* Animated book */}
        <div className="relative">
          <div className="animate-wiggle text-8xl">&#128218;</div>
          <div className="animate-sparkle absolute -right-4 -top-4 text-3xl">&#10024;</div>
          <div className="animate-sparkle-delayed absolute -left-3 top-0 text-2xl">&#11088;</div>
        </div>

        <div className="text-center">
          <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-purple-600">
            Making your story...
          </p>
          <p className="mt-2 text-lg font-semibold text-purple-400">
            Our magic pen is writing and drawing! &#127912;
          </p>
        </div>

        {/* Bouncing dots */}
        <div className="flex gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-4 w-4 rounded-full"
              style={{
                background: ["#a855f7", "#ec4899", "#f97316", "#22c55e", "#3b82f6"][i],
                animation: "bounce-dot 1.4s ease-in-out infinite",
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
