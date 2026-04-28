import Link from "next/link";
import PetAvatar from "@/components/PetAvatar";
import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import type { Pet } from "@/lib/types";

export const revalidate = 0;

export default async function PetsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <SignedOutEmpty
        title="Sign in to add your pets"
        href="/login?next=/pets"
      />
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
        <p className="text-sm text-ink-500">Couldn&apos;t load your pets.</p>
      </div>
    );
  }

  return (
    <div className="animate-rise-in mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-cream-300 pb-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-ink-900">
            Your pets
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Reference photos let the AI keep your pet looking like your pet
            across every page.
          </p>
        </div>
        <Link
          href="/pets/new"
          className="rounded-full bg-moss-700 px-5 py-2 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
        >
          Add a pet
        </Link>
      </div>

      {(!pets || pets.length === 0) && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-cream-300 bg-cream-50 px-6 py-16 text-center">
          <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink-900">
            No pets yet.
          </p>
          <p className="max-w-sm text-sm text-ink-500">
            Adding 3–5 clear photos in different poses gives the AI enough to
            keep your pet recognizable on every page.
          </p>
          <Link
            href="/pets/new"
            className="mt-2 rounded-full bg-moss-700 px-5 py-2 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
          >
            Add your first pet
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {(pets ?? []).map((p, i) => (
          <div
            key={p.id}
            className="animate-rise-in"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <PetCard pet={p as Pet} />
          </div>
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
      className="group flex flex-col overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-cream-300 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)]"
    >
      <div className="relative aspect-square overflow-hidden bg-cream-200">
        {cover ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={cover}
            alt={pet.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cream-200 via-cream-100 to-cream-50">
            <PetAvatar pet={pet} size={96} />
          </div>
        )}
        <div
          className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider shadow-sm ${
            pet.mode === "memorial"
              ? "bg-moss-100 text-ink-900"
              : "bg-cream-50/95 text-ink-500"
          }`}
        >
          {pet.mode === "memorial" ? "In memory" : "Living"}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink-900">
          {pet.name}
        </h3>
        <p className="text-xs uppercase tracking-wider text-ink-300">
          {pet.species}
          {pet.breed ? ` · ${pet.breed}` : ""}
        </p>
      </div>
    </Link>
  );
}

function SignedOutEmpty({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="font-[family-name:var(--font-display)] text-2xl font-semibold text-ink-900">
        {title}
      </p>
      <Link
        href={href}
        className="rounded-full bg-moss-700 px-6 py-2.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
      >
        Sign in
      </Link>
    </div>
  );
}
