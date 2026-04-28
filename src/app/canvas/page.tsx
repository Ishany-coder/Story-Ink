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
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6">
        <p className="text-sm text-slate-500">Couldn&apos;t load your stories.</p>
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
    <div className="animate-rise-in mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8 border-b border-stone-200 pb-4">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-slate-900">
          Studio
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick a story to design — swap layouts, edit text, add shapes.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stories.map((story, i) => (
          <Link
            key={story.id}
            href={`/canvas/${story.id}`}
            className="group animate-rise-in flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-stone-300 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)]"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <div className="relative aspect-square overflow-hidden bg-stone-100">
              {story.cover_image ? (
                <Image
                  src={story.cover_image}
                  alt={story.title}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  unoptimized
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-purple-100 via-purple-50 to-pink-100" />
              )}
              <div className="absolute right-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
                Design
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-1 p-4">
              <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900 line-clamp-1">
                {story.title}
              </h3>
              <p className="text-sm text-slate-500 line-clamp-2">
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
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="font-[family-name:var(--font-display)] text-2xl font-semibold text-slate-900">
        {title}
      </p>
      {subtitle && (
        <p className="max-w-sm text-sm text-slate-500">{subtitle}</p>
      )}
      <Link
        href={ctaHref}
        className="rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-[filter] hover:brightness-110"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
