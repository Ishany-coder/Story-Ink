import Link from "next/link";
import HeroSection from "@/components/HeroSection";
import HomeCreate from "@/components/HomeCreate";
import BookCard from "@/components/BookCard";
import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import type { Pet } from "@/lib/types";

export const revalidate = 0;

interface StoryRow {
  id: string;
  title: string;
  prompt: string;
  cover_image: string | null;
  page_count: number;
  created_at: string;
}

// Dashboard-style home page. Hero → create surface → "Your stories"
// grid (skipped if empty) → quick "Manage pets" link. The Read tab
// still exists for the long-form library; this section is a quick
// overview so the create flow isn't an island.
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) {
    return <SignedOutHero />;
  }

  const supa = await getSupabaseServer();
  const [petsRes, storiesRes] = await Promise.all([
    supa
      .from("pets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supa
      .from("stories")
      .select("id, title, prompt, cover_image, page_count, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const pets = (petsRes.data ?? []) as Pet[];
  const stories = (storiesRes.data ?? []) as StoryRow[];

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-16 pt-12">
      <section className="animate-rise-in mx-auto flex max-w-3xl flex-col items-center gap-8">
        <HeroSection />
        <HomeCreate pets={pets} />
      </section>

      {stories.length > 0 && (
        <section
          className="animate-rise-in mt-20"
          style={{ animationDelay: "120ms" }}
        >
          <SectionHeading
            title="Your stories"
            subtitle={`${stories.length} ${
              stories.length === 1 ? "book" : "books"
            } so far`}
            actionLabel="See all"
            actionHref="/read"
          />
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {stories.slice(0, 6).map((s, i) => (
              <div
                key={s.id}
                className="animate-rise-in"
                style={{ animationDelay: `${160 + i * 40}ms` }}
              >
                <BookCard
                  id={s.id}
                  title={s.title}
                  prompt={s.prompt}
                  coverImage={s.cover_image}
                  pageCount={s.page_count}
                  createdAt={s.created_at}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <section
        className="animate-rise-in mt-16"
        style={{ animationDelay: "200ms" }}
      >
        <SectionHeading
          title="Your pets"
          subtitle={
            pets.length === 0
              ? "Add a pet so the AI knows the star of the show."
              : `${pets.length} ${pets.length === 1 ? "pet" : "pets"}`
          }
          actionLabel={pets.length > 0 ? "Manage pets" : "Add a pet"}
          actionHref={pets.length > 0 ? "/pets" : "/pets/new"}
        />
        {pets.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-3">
            {pets.map((p) => (
              <Link
                key={p.id}
                href={`/pets/${p.id}`}
                className="flex items-center gap-3 rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-stone-300 hover:bg-stone-50"
              >
                <PetAvatarLite pet={p} />
                <span>{p.name}</span>
                {p.mode === "memorial" && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-purple-700">
                    In memory
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// Lightweight inline version of PetAvatar so the home page doesn't
// pull a client component just to show 28px circles in the pet row.
function PetAvatarLite({ pet }: { pet: Pet }) {
  const photo = pet.photos[0] ?? null;
  if (photo) {
    return (
      <div className="h-7 w-7 overflow-hidden rounded-full bg-stone-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo}
          alt={pet.name}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  const initial = pet.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-100 text-xs font-semibold text-purple-700">
      {initial}
    </div>
  );
}

function SectionHeading({
  title,
  subtitle,
  actionLabel,
  actionHref,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-200 pb-3">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-slate-900">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
        )}
      </div>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="text-sm font-medium text-purple-600 hover:text-purple-700"
        >
          {actionLabel} →
        </Link>
      )}
    </div>
  );
}

function SignedOutHero() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <HeroSection />
      <Link
        href="/login"
        className="rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-8 py-3 text-base font-semibold text-white shadow-md shadow-purple-200/40 transition-[filter] hover:brightness-110"
      >
        Get started
      </Link>
    </div>
  );
}
