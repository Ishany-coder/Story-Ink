import { notFound, redirect } from "next/navigation";
import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import PetForm from "@/components/PetForm";
import type { Pet } from "@/lib/types";

export const revalidate = 0;

export default async function PetEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=/pets/${id}`);
  }
  const supa = await getSupabaseServer();
  const { data: pet, error } = await supa
    .from("pets")
    .select("*")
    .eq("id", id)
    .single<Pet>();
  if (error || !pet) notFound();
  if (pet.user_id !== user.id) notFound();

  return <PetForm initial={pet} />;
}
