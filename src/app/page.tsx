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

// Threshold for when the home page collapses to a pure dashboard.
// Below this, the inline prompt + starters render on the home page so
// onboarding is one click. At or above this, the home page becomes
// "library + pets" and creation moves entirely behind /create.
const DASHBOARD_THRESHOLD = 2;

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
  const dashboardMode = stories.length >= DASHBOARD_THRESHOLD;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-16 pt-12">
      {dashboardMode ? (
        <DashboardHeader />
      ) : (
        <section className="animate-rise-in mx-auto flex max-w-3xl flex-col items-center gap-8">
          <HeroSection />
          <HomeCreate pets={pets} />
        </section>
      )}

      {stories.length > 0 && (
        <section
          className={`animate-rise-in ${dashboardMode ? "mt-2" : "mt-20"}`}
          style={{ animationDelay: "120ms" }}
        >
          <SectionHeading
            title="Your library"
            subtitle={`${stories.length} ${
              stories.length === 1 ? "book" : "books"
            }`}
            actionLabel="See all"
            actionHref="/read"
          />
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {stories.slice(0, 9).map((s, i) => (
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
                className="flex items-center gap-3 rounded-full border border-cream-300 bg-cream-50 px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:border-cream-400 hover:bg-cream-100"
              >
                <PetAvatarLite pet={p} />
                <span>{p.name}</span>
                {p.mode === "memorial" && (
                  <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] text-gold-900">
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

// Compact header for the dashboard variant. Brand kicker stays for
// continuity, but the hero gets dropped — at 2+ books the user knows
// what the product is and wants the library to lead visually.
function DashboardHeader() {
  return (
    <div className="animate-rise-in mb-12 flex flex-wrap items-end justify-between gap-4">
      <div>
        <span className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
          The fine art of pet storytelling
        </span>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
          Your library
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Pick up where you left off, or start something new.
        </p>
      </div>
      <Link
        href="/create"
        className="inline-flex items-center gap-1.5 rounded-full bg-moss-700 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
      >
        <PlusIcon />
        New story
      </Link>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M7 1.5v11M1.5 7h11" />
    </svg>
  );
}

// Lightweight inline version of PetAvatar so the home page doesn't
// pull a client component just to show 28px circles in the pet row.
function PetAvatarLite({ pet }: { pet: Pet }) {
  const photo = pet.photos[0] ?? null;
  if (photo) {
    return (
      <div className="h-7 w-7 overflow-hidden rounded-full bg-cream-200">
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
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-moss-100 text-xs font-semibold text-moss-700">
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
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-cream-300 pb-3">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-ink-900">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>
        )}
      </div>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="text-sm font-medium text-moss-700 transition-colors hover:text-ink-900"
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
        className="rounded-full bg-moss-700 px-8 py-3 text-base font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
      >
        Get started
      </Link>
    </div>
  );
}
