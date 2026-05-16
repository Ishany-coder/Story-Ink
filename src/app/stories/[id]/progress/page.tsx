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
    <main className="min-h-[calc(100vh-4rem)] bg-cream-100">
      <div className="max-w-2xl mx-auto px-4 py-12 sm:py-16">
        <div className="mb-8">
          <div className="text-[11px] uppercase tracking-[0.18em] text-gold-900 mb-2">
            Generating your storybook
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold text-ink-900 leading-tight">
            &ldquo;{story.title}&rdquo;
          </h1>
          <p className="text-ink-500 mt-3">
            Hang tight — we&apos;re bringing your story to life. This usually
            takes a minute or two.
          </p>
        </div>
        <StoryProgressClient storyId={id} />
      </div>
    </main>
  );
}
