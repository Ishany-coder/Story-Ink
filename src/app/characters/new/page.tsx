import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import CharacterForm from "@/components/CharacterForm";

type Props = { searchParams: Promise<{ next?: string }> };

export default async function NewCharacterPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  const { next } = await searchParams;
  if (!user) redirect(`/login?next=${encodeURIComponent("/characters/new")}`);
  return (
    <main className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-6">Add a character</h1>
      <CharacterForm initial={null} nextHref={next} />
    </main>
  );
}
