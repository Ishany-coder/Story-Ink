import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import ApproveCastClient from "@/components/ApproveCastClient";

type Props = { params: Promise<{ id: string }> };

interface JobResult {
  stage: string;
  storyId?: string;
  portraits: Array<{ characterId: string; name: string; portraitUrl: string }>;
}

export default async function ApproveCastPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user) redirect(`/login?next=/stories/${id}/approve-cast`);

  const admin = supabaseAdmin();
  const { data: story } = await admin
    .from("stories")
    .select("id, user_id, title")
    .eq("id", id)
    .single<{ id: string; user_id: string; title: string }>();
  if (!story || story.user_id !== user.id) notFound();

  // Find this story's awaiting-approval job by matching result.storyId.
  const { data: jobs } = await admin
    .from("jobs")
    .select("id, status, result")
    .eq("user_id", user.id)
    .eq("status", "awaiting_cast_approval")
    .order("created_at", { ascending: false })
    .limit(20);
  const job = (jobs ?? []).find((j) => {
    const r = j.result as JobResult | null;
    return r?.storyId === id;
  });

  if (!job || !(job.result as JobResult)?.portraits) {
    return (
      <main className="mx-auto max-w-2xl px-4 pt-8 sm:pt-12 pb-12 sm:pb-16">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-ink-900">
          Cast not ready yet
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          The cast portraits are still being generated. Refresh in a few
          seconds.
        </p>
      </main>
    );
  }

  const portraits = (job.result as JobResult).portraits;

  return (
    <main className="mx-auto max-w-3xl px-4 pt-8 sm:pt-12 pb-12 sm:pb-16">
      <h1 className="mb-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-ink-900">
        Approve your cast
      </h1>
      <p className="mb-6 text-sm text-ink-500">
        These portraits will be used as the visual reference for every page. If
        anyone looks wrong, regenerate just that character before the pages
        render.
      </p>
      <ApproveCastClient storyId={story.id} portraits={portraits} />
    </main>
  );
}
