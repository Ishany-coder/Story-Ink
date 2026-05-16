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
      <main className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-semibold">Cast not ready yet</h1>
        <p className="text-stone-600 mt-2">
          The cast portraits are still being generated. Refresh in a few
          seconds.
        </p>
      </main>
    );
  }

  const portraits = (job.result as JobResult).portraits;

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">Approve your cast</h1>
      <p className="text-stone-600 mb-6">
        These portraits will be used as the visual reference for every page. If
        anyone looks wrong, regenerate just that character before the pages
        render.
      </p>
      <ApproveCastClient storyId={story.id} portraits={portraits} />
    </main>
  );
}
