import { notFound, redirect } from "next/navigation";
import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import CanvasEditor from "@/components/CanvasEditor";
import type { Pet, Story } from "@/lib/types";

export const revalidate = 0;

export default async function CanvasStoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=/canvas/${id}`);
  }

  const supa = await getSupabaseServer();
  const { data: story, error } = await supa
    .from("stories")
    .select("*")
    .eq("id", id)
    .single<Story>();

  if (error || !story) notFound();
  // RLS allows reading the row only if it's public OR you own it.
  // Editing requires ownership; gate the editor explicitly so a public
  // story doesn't open in someone else's Studio.
  if ((story as Story & { user_id?: string | null }).user_id !== user.id) {
    notFound();
  }

  // Pull the pet (if any) for layout-mode filtering and so the
  // Studio can surface pet info in the editor header.
  let pet: Pet | null = null;
  const petId = (story as Story & { pet_id?: string | null }).pet_id ?? null;
  if (petId) {
    const { data: petRow } = await supa
      .from("pets")
      .select("*")
      .eq("id", petId)
      .maybeSingle<Pet>();
    pet = petRow ?? null;
  }

  return <CanvasEditor story={story} pet={pet} />;
}
