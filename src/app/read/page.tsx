import { supabase } from "@/lib/supabase";
import BookCard from "@/components/BookCard";
import Link from "next/link";

export const revalidate = 0;

export default async function ReadPage() {
  const { data: stories, error } = await supabase
    .from("stories")
    .select("id, title, prompt, cover_image, page_count, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6">
        <p className="text-lg font-bold text-purple-400">
          Oops! We couldn&apos;t load the stories. Try again!
        </p>
      </div>
    );
  }

  if (!stories || stories.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 px-6">
        <div className="text-8xl">&#128214;</div>
        <div className="text-center">
          <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-purple-600">
            No stories yet!
          </p>
          <p className="mt-1 text-lg font-semibold text-purple-400">
            Let&apos;s make your very first one!
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
          Your Stories &#128218;
        </h1>
        <p className="mt-1 text-lg font-semibold text-purple-400">
          {stories.length} {stories.length === 1 ? "story" : "stories"} — pick
          one to read!
        </p>
      </div>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {stories.map((story) => (
          <BookCard
            key={story.id}
            id={story.id}
            title={story.title}
            prompt={story.prompt}
            coverImage={story.cover_image}
            pageCount={story.page_count}
            createdAt={story.created_at}
          />
        ))}
      </div>
    </div>
  );
}
