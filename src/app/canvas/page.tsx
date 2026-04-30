import Link from "next/link";
import Image from "next/image";
import { getSupabaseServer, getCurrentUser } from "@/lib/supabase-server";

export const revalidate = 0;

export default async function CanvasIndexPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <EmptyState
        title="Sign in to design your stories"
        ctaLabel="Sign in"
        ctaHref="/login?next=/canvas"
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
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 sm:px-6 lg:px-8">
        <p className="text-sm text-ink-500">Couldn&apos;t load your stories.</p>
      </div>
    );
  }

  if (!stories || stories.length === 0) {
    return (
      <EmptyState
        title="No stories to design yet"
        subtitle="Create a story first, then come back here to lay it out."
        ctaLabel="Create a story"
        ctaHref="/"
      />
    );
  }

  return (
    <div className="animate-rise-in mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8 border-b border-cream-300 pb-4">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-ink-900">
          Studio
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Pick a story to design — swap layouts, edit text, add shapes.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stories.map((story, i) => (
          <Link
            key={story.id}
            href={`/canvas/${story.id}`}
            className="group animate-rise-in flex flex-col overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-cream-300 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)]"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <div className="relative aspect-square overflow-hidden bg-cream-200">
              {story.cover_image ? (
                <Image
                  src={story.cover_image}
                  alt={story.title}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  unoptimized
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-cream-200 via-cream-100 to-cream-50" />
              )}
              <div className="absolute right-3 top-3 rounded-full bg-cream-50/95 px-2.5 py-1 text-[11px] font-medium text-ink-500 shadow-sm">
                Design
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-1 p-4">
              <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink-900 line-clamp-1">
                {story.title}
              </h3>
              <p className="text-sm text-ink-500 line-clamp-2">
                {story.prompt}
              </p>
            </div>
          </Link>
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
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-5 px-4 sm:px-6 lg:px-8 text-center">
      <p className="font-[family-name:var(--font-display)] text-2xl font-semibold text-ink-900">
        {title}
      </p>
      {subtitle && (
        <p className="max-w-sm text-sm text-ink-500">{subtitle}</p>
      )}
      <Link
        href={ctaHref}
        className="rounded-full bg-moss-700 px-4 sm:px-6 lg:px-8 py-2.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
