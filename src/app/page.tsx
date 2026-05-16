import Link from "next/link";
import HeroSection from "@/components/HeroSection";
import BookCard from "@/components/BookCard";
import LandingPage from "@/components/LandingPage";
import ResumeDraftCard from "@/components/ResumeDraftCard";
import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { listDraftsForUser } from "@/lib/drafts";
import { listCharactersForUser } from "@/lib/characters";
import { pickStoryCover, storyImagesAreClean } from "@/lib/entitlement";
import type { Character } from "@/lib/types";

export const revalidate = 0;

interface StoryRow {
  id: string;
  title: string;
  prompt: string;
  cover_image: string | null;
  cover_image_watermarked: string | null;
  digital_unlocked: boolean | null;
  is_public: boolean | null;
  page_count: number;
  created_at: string;
}

// Threshold for when the home page collapses to a pure dashboard.
// Below this, the inline prompt + starters render on the home page so
// brand-new users have a one-click onboarding path. At or above
// this, the home page becomes "library + pets" only — creation
// moves entirely behind the navbar's "+ New story" CTA → /create.
//
// Set to 1 so the moment a user has any book, the home page is
// purely their library. Hero + inline prompt only show on a true
// empty state.
const DASHBOARD_THRESHOLD = 1;

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) {
    return <SignedOutHero />;
  }

  const supa = await getSupabaseServer();
  const [characters, storiesRes, drafts] = await Promise.all([
    listCharactersForUser(user.id).catch(() => [] as Character[]),
    supa
      .from("stories")
      .select(
        "id, title, prompt, cover_image, cover_image_watermarked, digital_unlocked, is_public, page_count, created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    listDraftsForUser(user.id).catch(() => []),
  ]);

  const stories = (storiesRes.data ?? []) as StoryRow[];
  const dashboardMode = stories.length >= DASHBOARD_THRESHOLD;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 pb-12 pt-8 sm:pb-16 sm:pt-12">
      {dashboardMode ? (
        <DashboardHeader />
      ) : (
        <section className="animate-rise-in mx-auto flex max-w-3xl flex-col items-center gap-8">
          <HeroSection />
          <Link
            href="/create/new"
            className="inline-flex items-center gap-1.5 rounded-full bg-moss-700 px-6 py-3 text-base font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
          >
            <PlusIcon />
            Start a book
          </Link>
        </section>
      )}

      {drafts.length > 0 && (
        <section
          className={`animate-rise-in ${dashboardMode ? "mt-2" : "mt-20"}`}
          style={{ animationDelay: "100ms" }}
        >
          <SectionHeading
            title="Resume a draft"
            subtitle={`${drafts.length} in progress`}
          />
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {drafts.map((d) => (
              <ResumeDraftCard key={d.id} draft={d} />
            ))}
          </div>
        </section>
      )}

      {stories.length > 0 && (
        <section
          className={`animate-rise-in ${
            dashboardMode && drafts.length === 0 ? "mt-2" : "mt-20"
          }`}
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
            {stories.slice(0, 9).map((s, i) => {
              // Library tile cover: watermarked unless paid/public/admin.
              // Beta excluded so dogfooders see the unpaid look.
              const cleanCover = storyImagesAreClean(s, {
                isAdmin: isAdminUser(user),
              });
              const cover = pickStoryCover(s, cleanCover);
              return (
              <div
                key={s.id}
                className="animate-rise-in"
                style={{ animationDelay: `${160 + i * 40}ms` }}
              >
                <BookCard
                  id={s.id}
                  title={s.title}
                  prompt={s.prompt}
                  coverImage={cover}
                  pageCount={s.page_count}
                  createdAt={s.created_at}
                />
              </div>
              );
            })}
          </div>
        </section>
      )}

      <section
        className="animate-rise-in mt-16"
        style={{ animationDelay: "200ms" }}
      >
        <SectionHeading
          title="Your characters"
          subtitle={
            characters.length === 0
              ? "Add a person or pet — they become the stars of your books."
              : `${characters.length} ${
                  characters.length === 1 ? "character" : "characters"
                }`
          }
          actionLabel={
            characters.length > 0 ? "Manage characters" : "Add a character"
          }
          actionHref={
            characters.length > 0 ? "/characters" : "/characters/new"
          }
        />
        {characters.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-3">
            {characters.map((c) => (
              <Link
                key={c.id}
                href={`/characters/${c.id}`}
                className="flex items-center gap-3 rounded-full border border-cream-300 bg-cream-50 px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:border-cream-400 hover:bg-cream-100"
              >
                <CharacterAvatarLite character={c} />
                <span>{c.name}</span>
                <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-ink-300">
                  {c.kind}
                </span>
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
    <div className="animate-rise-in mb-12 flex flex-col items-center gap-4 text-center sm:mb-14 sm:flex-row sm:items-end sm:justify-between sm:text-left">
      <div>
        <span className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
          The fine art of personalized storytelling
        </span>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
          Your library
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Pick up where you left off, or start something new.
        </p>
      </div>
      <Link
        href="/create/new"
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

// 28px circle avatar for the character row on the home page. Inline
// here so the home page doesn't need a client component for it.
function CharacterAvatarLite({ character }: { character: Character }) {
  const photo = character.reference_photo_urls[0] ?? null;
  if (photo) {
    return (
      <div className="h-7 w-7 overflow-hidden rounded-full bg-cream-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo}
          alt={character.name}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  const initial = character.name.trim().charAt(0).toUpperCase() || "?";
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
  return <LandingPage />;
}
