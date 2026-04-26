import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import StoryLinkCard from "@/components/StoryLinkCard";
import Link from "next/link";

export const revalidate = 0;

// Story picker for the ship-a-real-book flow. Each card deep-links into
// /ship/[id] — that page has the address form, price breakdown, and
// Stripe Checkout button.

export default async function ShipIndexPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 px-6">
        <div className="text-7xl">&#128274;</div>
        <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-purple-600">
          Sign in to ship your books
        </p>
        <Link
          href="/login?next=/ship"
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
        <div className="text-8xl">&#128230;</div>
        <div className="text-center">
          <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-purple-600">
            No stories to ship yet!
          </p>
          <p className="mt-1 text-lg font-semibold text-purple-400">
            Write one first, then come back to print it.
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

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 text-center sm:text-left">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold text-purple-700">
          Ship Your Books &#128230;
        </h1>
        <p className="mt-1 text-lg font-semibold text-purple-400">
          Pick a story to print as a real 8.5&quot; × 8.5&quot; hardcover
          and ship to your door.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {stories.map((story) => (
          <StoryLinkCard
            key={story.id}
            id={story.id}
            title={story.title}
            prompt={story.prompt}
            coverImage={story.cover_image}
            pageCount={story.page_count}
            createdAt={story.created_at}
            href={`/ship/${story.id}`}
            badge="Ship"
          />
        ))}
      </div>
    </div>
  );
}
