import { supabaseAdmin } from "@/lib/supabase";
import type { StoryDraft, WizardPayload } from "@/lib/types";

const MAX_DRAFTS_PER_USER = 50;

function autoTitle(payload: WizardPayload): string {
  const recipient = payload.recipientType ?? "someone";
  const occasion = payload.occasion ? ` ${payload.occasion}` : "";
  return `${recipient}${occasion} book — draft`.replace(/_/g, " ");
}

export async function listDraftsForUser(userId: string): Promise<StoryDraft[]> {
  const { data, error } = await supabaseAdmin()
    .from("story_drafts")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(MAX_DRAFTS_PER_USER);
  if (error) throw new Error(`listDraftsForUser: ${error.message}`);
  return (data ?? []) as StoryDraft[];
}

export async function getDraftForUser(
  draftId: string,
  userId: string
): Promise<StoryDraft | null> {
  const { data, error } = await supabaseAdmin()
    .from("story_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("user_id", userId)
    .maybeSingle<StoryDraft>();
  if (error) throw new Error(`getDraftForUser: ${error.message}`);
  return data;
}

export async function createDraftForUser(
  userId: string,
  initial?: Partial<WizardPayload>
): Promise<StoryDraft> {
  const payload = (initial ?? {}) as WizardPayload;
  const { data, error } = await supabaseAdmin()
    .from("story_drafts")
    .insert({
      user_id: userId,
      title: autoTitle(payload),
      current_step: 1,
      payload,
    })
    .select("*")
    .single<StoryDraft>();
  if (error || !data) throw new Error(`createDraftForUser: ${error?.message}`);
  return data;
}

export async function updateDraftForUser(
  draftId: string,
  userId: string,
  patch: { current_step?: number; payload?: WizardPayload }
): Promise<StoryDraft> {
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof patch.current_step === "number") {
    update.current_step = Math.min(Math.max(patch.current_step, 1), 7);
  }
  if (patch.payload) {
    update.payload = patch.payload;
    update.title = autoTitle(patch.payload);
  }
  const { data, error } = await supabaseAdmin()
    .from("story_drafts")
    .update(update)
    .eq("id", draftId)
    .eq("user_id", userId)
    .select("*")
    .single<StoryDraft>();
  if (error || !data) throw new Error(`updateDraftForUser: ${error?.message}`);
  return data;
}

export async function deleteDraftForUser(
  draftId: string,
  userId: string
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("story_drafts")
    .delete()
    .eq("id", draftId)
    .eq("user_id", userId);
  if (error) throw new Error(`deleteDraftForUser: ${error.message}`);
}
