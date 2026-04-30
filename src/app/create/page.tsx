import { redirect } from "next/navigation";
import HeroSection from "@/components/HeroSection";
import HomeCreate from "@/components/HomeCreate";
import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import type { Pet } from "@/lib/types";

export const revalidate = 0;

// Dedicated creation surface. Reached either from the navbar's
// "+ New story" CTA or from the home page when the user has fewer
// than 2 books (in which case the inline prompt on / is the same
// component, just embedded). At 2+ books the home page hides the
// inline prompt entirely and this is the canonical place to create.
export default async function CreatePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/create");
  }

  const supa = await getSupabaseServer();
  const { data: pets } = await supa
    .from("pets")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="animate-rise-in mx-auto flex w-full max-w-3xl flex-col items-center gap-10 px-4 sm:px-6 lg:px-8 py-12">
      <HeroSection />
      <HomeCreate pets={(pets ?? []) as Pet[]} />
    </div>
  );
}
