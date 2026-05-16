import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import { getCharacterForUser } from "@/lib/characters";
import CharacterForm from "@/components/CharacterForm";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ next?: string }>;
};

export default async function EditCharacterPage({
  params,
  searchParams,
}: Props) {
  const user = await getCurrentUser();
  const { id } = await params;
  const { next } = await searchParams;
  if (!user) redirect(`/login?next=/characters/${id}`);
  const character = await getCharacterForUser(id, user.id);
  if (!character) notFound();
  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      <CharacterForm initial={character} nextHref={next} />
    </main>
  );
}
