import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import ListenIndex from "@/components/ListenIndex";
import Link from "next/link";

export const revalidate = 0;

// Story picker for narration mode. Lets users set up their cloned voice
// (or re-record) before diving into a story — previously the only way to
// get to the narrator setup was opening an individual story first.
export default async function ListenIndexPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 px-6">
        <div className="text-7xl">&#128274;</div>
        <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-purple-600">
          Sign in to hear your stories
        </p>
        <Link
          href="/login?next=/listen"
          className="rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-8 py-3 text-base font-black text-white shadow-lg shadow-purple-300/40"
        >
          Sign in
        </Link>
      </div>
    );
  }
  const supa = await getSupabaseServer();
  const { data: stories, error } = await supa
    .from("stories")
    .select("id, title, prompt, cover_image, page_count, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6">
        <p className="text-lg font-bold text-purple-400">
          Couldn&apos;t load your stories. Try again!
        </p>
      </div>
    );
  }

  if (!stories || stories.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 px-6">
        <div className="text-8xl">&#127908;</div>
        <div className="text-center">
          <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-purple-600">
            No stories to listen to yet!
          </p>
          <p className="mt-1 text-lg font-semibold text-purple-400">
            Write one first, then come back to hear it in your voice.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-8 py-4 text-lg font-black text-white shadow-lg shadow-purple-300/40 transition-all hover:scale-105"
        >
          Create a Story &#10024;
        </Link>
      </div>
    );
  }

  return <ListenIndex stories={stories} />;
}
