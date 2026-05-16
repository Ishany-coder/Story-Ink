import { supabaseAdmin } from "@/lib/supabase";
import type {
  Character,
  CreateCharacterInput,
  UpdateCharacterInput,
} from "@/lib/types";

const MAX_PHOTOS_PER_CHARACTER = 5;

function clampPhotos(urls: string[] | undefined): string[] {
  if (!urls) return [];
  return urls.slice(0, MAX_PHOTOS_PER_CHARACTER);
}

export async function listCharactersForUser(userId: string): Promise<Character[]> {
  const { data, error } = await supabaseAdmin()
    .from("characters")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listCharactersForUser: ${error.message}`);
  return (data ?? []) as Character[];
}

export async function getCharacterForUser(
  characterId: string,
  userId: string
): Promise<Character | null> {
  const { data, error } = await supabaseAdmin()
    .from("characters")
    .select("*")
    .eq("id", characterId)
    .eq("user_id", userId)
    .maybeSingle<Character>();
  if (error) throw new Error(`getCharacterForUser: ${error.message}`);
  return data;
}

export async function createCharacterForUser(
  userId: string,
  input: CreateCharacterInput
): Promise<Character> {
  if (!input.name?.trim()) throw new Error("name is required");
  if (input.kind !== "person" && input.kind !== "pet") {
    throw new Error("kind must be 'person' or 'pet'");
  }
  const row = {
    user_id: userId,
    kind: input.kind,
    name: input.name.trim(),
    role_label: input.role_label?.trim() || null,
    traits: input.traits?.trim() || null,
    species: input.kind === "pet" ? input.species?.trim() || null : null,
    reference_photo_urls: clampPhotos(input.reference_photo_urls),
  };
  const { data, error } = await supabaseAdmin()
    .from("characters")
    .insert(row)
    .select("*")
    .single<Character>();
  if (error || !data) throw new Error(`createCharacterForUser: ${error?.message}`);
  return data;
}

export async function updateCharacterForUser(
  characterId: string,
  userId: string,
  patch: UpdateCharacterInput
): Promise<Character> {
  // Confirm ownership first; admin client bypasses RLS.
  const existing = await getCharacterForUser(characterId, userId);
  if (!existing) throw new Error("character not found");

  const nextKind = patch.kind ?? existing.kind;
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.role_label !== undefined)
    update.role_label = patch.role_label?.trim() || null;
  if (patch.traits !== undefined)
    update.traits = patch.traits?.trim() || null;
  if (patch.kind !== undefined) update.kind = patch.kind;
  // species only retained when kind is 'pet'.
  if (patch.species !== undefined || patch.kind !== undefined) {
    update.species =
      nextKind === "pet"
        ? (patch.species ?? existing.species)?.trim() || null
        : null;
  }
  if (patch.reference_photo_urls !== undefined) {
    update.reference_photo_urls = clampPhotos(patch.reference_photo_urls);
  }

  const { data, error } = await supabaseAdmin()
    .from("characters")
    .update(update)
    .eq("id", characterId)
    .eq("user_id", userId)
    .select("*")
    .single<Character>();
  if (error || !data) throw new Error(`updateCharacterForUser: ${error?.message}`);
  return data;
}

export async function deleteCharacterForUser(
  characterId: string,
  userId: string
): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await admin
    .from("characters")
    .delete()
    .eq("id", characterId)
    .eq("user_id", userId);
  if (error) throw new Error(`deleteCharacterForUser: ${error.message}`);

  // Best-effort cleanup: strip the deleted id from any drafts that
  // still reference it. Without this, an old draft's cast picker
  // carries a dead id all the way to /api/generate/v2 — which used to
  // produce a silent 403. The wizard's mount-time filter + the API's
  // sanitization are belt-and-suspenders for this; failures here are
  // logged but non-fatal.
  try {
    const { data: drafts } = await admin
      .from("story_drafts")
      .select("id, payload")
      .eq("user_id", userId);
    for (const d of (drafts ?? []) as Array<{
      id: string;
      payload: Record<string, unknown> | null;
    }>) {
      const payload = d.payload;
      const cast = payload?.castCharacterIds;
      if (!Array.isArray(cast) || !cast.includes(characterId)) continue;
      const nextCast = cast.filter((x) => x !== characterId);
      const nextPayload = { ...(payload ?? {}), castCharacterIds: nextCast };
      await admin
        .from("story_drafts")
        .update({ payload: nextPayload })
        .eq("id", d.id);
    }
  } catch (e) {
    console.warn("deleteCharacterForUser: draft cast cleanup failed", e);
  }
}

export const CHARACTER_LIMITS = { maxPhotos: MAX_PHOTOS_PER_CHARACTER };
