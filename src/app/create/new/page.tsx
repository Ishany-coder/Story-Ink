import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import { listCharactersForUser } from "@/lib/characters";
import { getDraftForUser, createDraftForUser } from "@/lib/drafts";
import { supabaseAdmin } from "@/lib/supabase";
import WizardClient from "@/components/wizard/WizardClient";
import type { ArtStyle, Character, StoryDraft } from "@/lib/types";

type Props = { searchParams: Promise<{ draft?: string }> };

export default async function CreateNewPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/create/new");
  const { draft: draftId } = await searchParams;

  let draft: StoryDraft | null = null;
  if (draftId) {
    draft = await getDraftForUser(draftId, user.id);
  }
  if (!draft) {
    draft = await createDraftForUser(user.id, {});
    redirect(`/create/new?draft=${draft.id}`);
  }

  const [characters, stylesResult] = await Promise.all([
    listCharactersForUser(user.id),
    supabaseAdmin()
      .from("art_styles")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);
  const styles = (stylesResult.data ?? []) as ArtStyle[];

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <WizardClient
        draft={draft}
        initialCharacters={characters as Character[]}
        artStyles={styles}
      />
    </main>
  );
}
