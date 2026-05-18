import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import ApproveCastClient from "@/components/ApproveCastClient";

type Props = { params: Promise<{ id: string }> };

interface JobResult {
  stage: string;
  storyId?: string;
  portraits: Array<{ characterId: string; name: string; portraitUrl: string }>;
  // Spec A: AI-cast portraits also live on the job result. Older
  // jobs from before this field existed are tolerated as undefined.
  aiPortraits?: Array<{
    aiCastId: string;
    name: string;
    roleLabel: string | null;
    kind: "person" | "pet";
    portraitUrl: string;
  }>;
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

  const result = job.result as JobResult;
  const portraits = result.portraits;
  // Always read the AI-cast list fresh from the DB (not the cached
  // job payload) — the user may have renamed entries since the job
  // wrote its result, and re-reads after a regen/remove flow.
  const { data: aiCastRows } = await admin
    .from("story_ai_cast")
    .select("id, name, role_label, kind, portrait_url, user_prompt_addition")
    .eq("story_id", story.id)
    .not("portrait_url", "is", null)
    .order("created_at", { ascending: true });
  const aiPortraits = (aiCastRows ?? [])
    .filter((r): r is typeof r & { portrait_url: string } => r.portrait_url !== null)
    .map((r) => ({
      aiCastId: r.id,
      name: r.name,
      roleLabel: r.role_label,
      kind: r.kind as "person" | "pet",
      portraitUrl: r.portrait_url,
      promptAddition: r.user_prompt_addition,
    }));

  // Spec B: backgrounds. Same fresh-read-from-DB pattern as AI
  // cast — renames/regens land here before the cached job payload
  // catches up.
  const { data: bgRows } = await admin
    .from("story_backgrounds")
    .select("id, label, portrait_url, user_prompt_addition")
    .eq("story_id", story.id)
    .not("portrait_url", "is", null)
    .order("created_at", { ascending: true });
  const backgrounds = (bgRows ?? [])
    .filter((r): r is typeof r & { portrait_url: string } => r.portrait_url !== null)
    .map((r) => ({
      bgId: r.id,
      label: r.label,
      portraitUrl: r.portrait_url,
      promptAddition: r.user_prompt_addition,
    }));

  return (
    <main className="mx-auto max-w-3xl px-4 pt-8 sm:pt-12 pb-12 sm:pb-16">
      <h1 className="mb-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-ink-900">
        Approve your story
      </h1>
      <p className="mb-6 text-sm text-ink-500">
        These portraits and settings will be used as the visual reference for
        every page. If anything looks wrong, regenerate it before the pages
        render.
      </p>
      <ApproveCastClient
        storyId={story.id}
        portraits={portraits}
        aiPortraits={aiPortraits}
        backgrounds={backgrounds}
      />
    </main>
  );
}
