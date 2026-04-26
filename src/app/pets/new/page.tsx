import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import PetForm from "@/components/PetForm";

export const revalidate = 0;

export default async function NewPetPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/pets/new");
  }
  return <PetForm initial={null} />;
}
