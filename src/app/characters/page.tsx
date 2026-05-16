import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import { listCharactersForUser } from "@/lib/characters";
import CharacterCard from "@/components/CharacterCard";

export default async function CharactersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/characters");

  const characters = await listCharactersForUser(user.id);

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-semibold">Your characters</h1>
        <Link
          href="/characters/new"
          className="px-4 py-2 bg-black text-white rounded"
        >
          + Add character
        </Link>
      </div>

      {characters.length === 0 ? (
        <div className="border rounded-lg p-10 text-center bg-stone-50">
          <p className="text-stone-700 mb-1">No characters yet.</p>
          <p className="text-stone-500 text-sm mb-4">
            Add people or pets — they become the stars of your books.
          </p>
          <Link
            href="/characters/new"
            className="inline-block px-4 py-2 bg-black text-white rounded"
          >
            Add your first character
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {characters.map((c) => (
            <CharacterCard key={c.id} character={c} />
          ))}
        </div>
      )}
    </main>
  );
}
