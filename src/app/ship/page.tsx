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
      <EmptyState
        title="Sign in to ship your books"
        ctaLabel="Sign in"
        ctaHref="/login?next=/ship"
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
        <p className="text-sm text-ink-500">Couldn&apos;t load your stories.</p>
      </div>
    );
  }

  if (!stories || stories.length === 0) {
    return (
      <EmptyState
        title="No stories to ship yet"
        subtitle="Write one first, then come back to print it."
        ctaLabel="Create a story"
        ctaHref="/"
      />
    );
  }

  return (
    <div className="animate-rise-in mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8 border-b border-cream-300 pb-4">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-ink-900">
          Ship a printed book
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Pick a story to print as a real 8.5&quot; × 8.5&quot; hardcover and
          ship to your door.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stories.map((story, i) => (
          <div
            key={story.id}
            className="animate-rise-in"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <StoryLinkCard
              id={story.id}
              title={story.title}
              prompt={story.prompt}
              coverImage={story.cover_image}
              pageCount={story.page_count}
              createdAt={story.created_at}
              href={`/ship/${story.id}`}
              badge="Ship"
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
  subtitle?: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="font-[family-name:var(--font-display)] text-2xl font-semibold text-ink-900">
        {title}
      </p>
      {subtitle && (
        <p className="max-w-sm text-sm text-ink-500">{subtitle}</p>
      )}
      <Link
        href={ctaHref}
        className="rounded-full bg-moss-700 px-6 py-2.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
