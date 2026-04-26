import Link from "next/link";
import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import type { Pet } from "@/lib/types";

export const revalidate = 0;

export default async function PetsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 px-6">
        <div className="text-7xl">&#128062;</div>
        <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-purple-600">
          Sign in to add your pets
        </p>
        <Link
          href="/login?next=/pets"
          className="rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-8 py-3 text-base font-black text-white shadow-lg shadow-purple-300/40"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const supa = await getSupabaseServer();
  const { data: pets, error } = await supa
    .from("pets")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6">
        <p className="text-lg font-bold text-purple-400">
          Couldn&apos;t load your pets.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold text-purple-700">
            Your pets &#128062;
          </h1>
          <p className="mt-1 text-lg font-semibold text-purple-400">
            Add a pet to make stories that actually look like them.
          </p>
        </div>
        <Link
          href="/pets/new"
          className="rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-6 py-3 text-base font-black text-white shadow-md shadow-purple-200 transition-all hover:scale-105"
        >
          + Add a pet
        </Link>
      </div>

      {(!pets || pets.length === 0) && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-purple-200 bg-white px-6 py-16 text-center">
          <div className="text-6xl">&#129420;</div>
          <p className="font-[family-name:var(--font-display)] text-xl font-bold text-purple-600">
            No pets yet.
          </p>
          <p className="text-sm font-semibold text-purple-400">
            Adding photos lets the AI keep your pet looking like your pet
            across every page.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {(pets ?? []).map((p) => (
          <PetCard key={p.id} pet={p as Pet} />
        ))}
      </div>
    </div>
  );
}

function PetCard({ pet }: { pet: Pet }) {
  const cover = pet.photos[0] ?? null;
  return (
    <Link
      href={`/pets/${pet.id}`}
      className="group flex flex-col overflow-hidden rounded-3xl border-3 border-purple-200 bg-white shadow-md transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-purple-200/50"
    >
      <div className="relative aspect-square overflow-hidden">
        {cover ? (
          // Plain <img> here — pet photos can be any Supabase Storage URL
          // and we don't want to deal with next/image domain config.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={pet.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-purple-100 to-pink-100">
            <span className="text-7xl">{speciesEmoji(pet.species)}</span>
          </div>
        )}
        <div
          className={`absolute right-3 top-3 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider shadow-sm ${
            pet.mode === "memorial"
              ? "bg-purple-100 text-purple-700"
              : "bg-white/90 text-purple-600"
          }`}
        >
          {pet.mode === "memorial" ? "In memory" : "Living"}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-5">
        <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-purple-700">
          {pet.name}
        </h3>
        <p className="text-xs font-bold uppercase tracking-wider text-purple-300">
          {pet.species}
          {pet.breed ? ` · ${pet.breed}` : ""}
        </p>
      </div>
    </Link>
  );
}

function speciesEmoji(s: string): string {
  switch (s) {
    case "dog":
      return "\u{1F436}";
    case "cat":
      return "\u{1F431}";
    case "bird":
      return "\u{1F426}";
    case "rabbit":
      return "\u{1F430}";
    case "horse":
      return "\u{1F434}";
    case "reptile":
      return "\u{1F98E}";
    case "fish":
      return "\u{1F41F}";
    default:
      return "\u{1F43E}";
  }
}
