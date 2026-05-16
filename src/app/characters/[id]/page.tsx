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
    <main className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-6">Edit {character.name}</h1>
      <CharacterForm initial={character} />
    </main>
  );
}
