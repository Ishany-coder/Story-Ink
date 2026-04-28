import { getSupabaseServer, getCurrentUser } from "@/lib/supabase-server";
import BookCard from "@/components/BookCard";
import Link from "next/link";

export const revalidate = 0;

export default async function ReadPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <EmptyState
        title="Sign in to see your stories"
        subtitle="Stories are private to your account."
        ctaLabel="Sign in"
        ctaHref="/login?next=/read"
      />
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
        <p className="text-sm text-slate-500">Couldn&apos;t load your stories.</p>
      </div>
    );
  }

  if (!stories || stories.length === 0) {
    return (
      <EmptyState
        title="No stories yet"
        subtitle="Make your first one and it'll show up here."
        ctaLabel="Create a story"
        ctaHref="/"
      />
    );
  }

  return (
    <div className="animate-rise-in mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3 border-b border-stone-200 pb-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-slate-900">
            Your stories
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {stories.length} {stories.length === 1 ? "book" : "books"} — pick
            one to read.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-[filter] hover:brightness-110"
        >
          New story
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stories.map((story, i) => (
          <div
            key={story.id}
            className="animate-rise-in"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <BookCard
              id={story.id}
              title={story.title}
              prompt={story.prompt}
              coverImage={story.cover_image}
              pageCount={story.page_count}
              createdAt={story.created_at}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  subtitle,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="font-[family-name:var(--font-display)] text-2xl font-semibold text-slate-900">
        {title}
      </p>
      <p className="max-w-sm text-sm text-slate-500">{subtitle}</p>
      <Link
        href={ctaHref}
        className="rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-[filter] hover:brightness-110"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
