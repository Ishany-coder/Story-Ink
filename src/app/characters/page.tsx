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
    <main className="mx-auto max-w-4xl px-4 pt-8 pb-12 sm:pt-12 sm:pb-16">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-ink-900">
          Your characters
        </h1>
        <Link
          href="/characters/new"
          className="inline-flex items-center gap-1.5 rounded-full bg-moss-700 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2"
        >
          + Add character
        </Link>
      </div>

      {characters.length === 0 ? (
        <div className="rounded-2xl border border-cream-300 bg-cream-50 p-10 text-center">
          <p className="mb-1 text-ink-900">No characters yet.</p>
          <p className="mb-4 text-sm text-ink-500">
            Add people or pets — they become the stars of your books.
          </p>
          <Link
            href="/characters/new"
            className="inline-flex items-center gap-1.5 rounded-full bg-moss-700 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2"
          >
            Add your first character
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {characters.map((c) => (
            <CharacterCard key={c.id} character={c} />
          ))}
        </div>
      )}
    </main>
  );
}
