import Link from "next/link";
import HeroSection from "@/components/HeroSection";
import HomeCreate from "@/components/HomeCreate";
import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import type { Pet } from "@/lib/types";

export const revalidate = 0;

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) {
    return <SignedOutHero />;
  }

  const supa = await getSupabaseServer();
  const { data: pets } = await supa
    .from("pets")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      {/* Fun background shapes */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float absolute -left-20 top-20 h-64 w-64 rounded-full bg-yellow-200/40 blur-2xl" />
        <div className="animate-float-reverse absolute -right-16 top-40 h-48 w-48 rounded-full bg-pink-200/40 blur-2xl" />
        <div className="animate-float-slow absolute bottom-20 left-1/4 h-56 w-56 rounded-full bg-blue-200/30 blur-2xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col items-center gap-10 px-6 py-12">
        <HeroSection />
        <HomeCreate pets={(pets ?? []) as Pet[]} />
      </div>
    </div>
  );
}

function SignedOutHero() {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float absolute -left-20 top-20 h-64 w-64 rounded-full bg-yellow-200/40 blur-2xl" />
        <div className="animate-float-reverse absolute -right-16 top-40 h-48 w-48 rounded-full bg-pink-200/40 blur-2xl" />
        <div className="animate-float-slow absolute bottom-20 left-1/4 h-56 w-56 rounded-full bg-blue-200/30 blur-2xl" />
      </div>
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
        <HeroSection />
        <p className="max-w-lg text-base font-semibold text-purple-500">
          Sign in to add your pets and turn their stories into beautifully
          illustrated books.
        </p>
        <Link
          href="/login"
          className="rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-10 py-4 text-lg font-black text-white shadow-xl shadow-purple-300/40 transition-all hover:scale-105"
        >
          Sign in to start
        </Link>
      </div>
    </div>
  );
}
