import HeroSection from "@/components/HeroSection";
import PromptForm from "@/components/PromptForm";

export default function Home() {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      {/* Fun background shapes */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float absolute -left-20 top-20 h-64 w-64 rounded-full bg-yellow-200/40 blur-2xl" />
        <div className="animate-float-reverse absolute -right-16 top-40 h-48 w-48 rounded-full bg-pink-200/40 blur-2xl" />
        <div className="animate-float-slow absolute bottom-20 left-1/4 h-56 w-56 rounded-full bg-blue-200/30 blur-2xl" />
        <div className="animate-float absolute bottom-10 right-1/3 h-40 w-40 rounded-full bg-green-200/30 blur-2xl" />

        {/* Sparkle decorations */}
        <div className="animate-sparkle absolute left-[15%] top-[20%] text-3xl">&#10024;</div>
        <div className="animate-sparkle-delayed absolute right-[20%] top-[15%] text-2xl">&#11088;</div>
        <div className="animate-sparkle-slow absolute left-[70%] top-[60%] text-3xl">&#10024;</div>
        <div className="animate-sparkle absolute left-[10%] bottom-[25%] text-2xl">&#11088;</div>
      </div>

      <div className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-12 px-6 py-16">
        <HeroSection />
        <PromptForm />
      </div>
    </div>
  );
}
