import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import { getCharacterForUser } from "@/lib/characters";
import CharacterForm from "@/components/CharacterForm";

type Props = { params: Promise<{ id: string }> };

export default async function EditCharacterPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user) redirect(`/login?next=/characters/${id}`);
  const character = await getCharacterForUser(id, user.id);
  if (!character) notFound();
  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      <CharacterForm initial={character} />
    </main>
  );
}
