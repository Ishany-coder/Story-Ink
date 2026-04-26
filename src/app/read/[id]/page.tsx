import { getSupabaseServer } from "@/lib/supabase-server";
import { Story } from "@/lib/types";
import SlideReader from "@/components/SlideReader";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 0;

// Reading is allowed for public stories without sign-in — RLS shows
// is_public=true rows to anon. Owners can also read their private rows.
export default async function ReadStoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supa = await getSupabaseServer();
  const { data, error } = await supa
    .from("stories")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const story = data as Story;

  if (!story.pages || story.pages.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 px-6">
        <p className="text-gray-400">This story has no pages.</p>
        <Link
          href="/read"
          className="text-sm text-amber-400 hover:text-amber-300"
        >
          Back to library
        </Link>
      </div>
    );
  }

  return <SlideReader story={story} />;
}
