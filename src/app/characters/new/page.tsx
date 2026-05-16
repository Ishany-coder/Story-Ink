import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import CharacterForm from "@/components/CharacterForm";

type Props = { searchParams: Promise<{ next?: string }> };

export default async function NewCharacterPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  const { next } = await searchParams;
  if (!user) redirect(`/login?next=${encodeURIComponent("/characters/new")}`);
  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      <CharacterForm initial={null} nextHref={next} />
    </main>
  );
}
