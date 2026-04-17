import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

export const revalidate = 0;

export default async function CanvasIndexPage() {
  const { data: stories, error } = await supabase
    .from("stories")
    .select("id, title, prompt, cover_image, page_count, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6">
        <p className="text-lg font-bold text-purple-400">
          Oops! We couldn&apos;t load your stories.
        </p>
      </div>
    );
  }

  if (!stories || stories.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 px-6">
        <div className="text-8xl">&#127912;</div>
        <div className="text-center">
          <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-purple-600">
            No stories to design yet!
          </p>
          <p className="mt-1 text-lg font-semibold text-purple-400">
            Create one first, then come back to decorate it.
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
          Studio &#127912;
        </h1>
        <p className="mt-1 text-lg font-semibold text-purple-400">
          Pick a story to design — swap layouts, edit text, add shapes.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {stories.map((story) => (
          <Link
            key={story.id}
            href={`/canvas/${story.id}`}
            className="group flex flex-col overflow-hidden rounded-3xl border-3 border-purple-200 bg-white shadow-md transition-all hover:-translate-y-2 hover:shadow-xl hover:shadow-purple-200/50"
          >
            <div className="relative aspect-square overflow-hidden">
              {story.cover_image ? (
                <Image
                  src={story.cover_image}
                  alt={story.title}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-gradient-to-br from-purple-100 to-pink-100">
                  <span className="text-7xl">&#127912;</span>
                </div>
              )}
              <div className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-purple-600 shadow-sm">
                Design
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-1 p-5">
              <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-purple-700 line-clamp-1">
                {story.title}
              </h3>
              <p className="text-sm font-medium text-purple-300 line-clamp-2">
                {story.prompt}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
