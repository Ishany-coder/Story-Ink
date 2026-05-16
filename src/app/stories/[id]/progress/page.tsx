import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import StoryProgressClient from "@/components/StoryProgressClient";

type Props = { params: Promise<{ id: string }> };

export default async function StoryProgressPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user) redirect(`/login?next=/stories/${id}/progress`);

  const admin = supabaseAdmin();
  const { data: story } = await admin
    .from("stories")
    .select("id, user_id, title")
    .eq("id", id)
    .single<{ id: string; user_id: string; title: string }>();
  if (!story || story.user_id !== user.id) notFound();

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">
        Generating &ldquo;{story.title}&rdquo;
      </h1>
      <p className="text-stone-600 mb-6">
        This page polls until either the cast is ready for approval or the book
        finishes generating.
      </p>
      <StoryProgressClient storyId={id} />
    </main>
  );
}
