import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { Story } from "@/lib/types";
import SlideReader from "@/components/SlideReader";
import AdminExportPdfButton from "@/components/AdminExportPdfButton";
import DigitalUpsell from "@/components/DigitalUpsell";
import { DIGITAL_PRICE_USD } from "@/lib/pricing";
import { isBetaTesting } from "@/lib/beta-flag";
import { storyImagesAreClean } from "@/lib/entitlement";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 0;
// Force dynamic so the unlock state propagates instantly after a Stripe
// return — the user shouldn't see a stale "locked" version after paying.
export const dynamic = "force-dynamic";

// Public-safe column list. We deliberately do NOT include `user_id`,
// `ai_system_prompt`, `pet_id`, or `prompt` on the row that ends up
// serialized to the client — those leak the owning user's identity and
// any private notes the owner has stashed in the system prompt.
const PUBLIC_COLUMNS =
  "id, title, page_count, pages, cover_image, cover_image_watermarked, art_style_id, is_public, digital_unlocked, created_at";

interface StoryRowWithOwner {
  id: string;
  title: string;
  page_count: number;
  pages: Story["pages"];
  cover_image: string | null;
  cover_image_watermarked: string | null;
  art_style_id: string;
  is_public: boolean;
  digital_unlocked: boolean;
  created_at: string;
  user_id: string | null;
}

// Reading is allowed for public stories without sign-in — RLS shows
// is_public=true rows to anon. Owners can also read their own rows
// (RLS too), but the owner has to unlock the digital tier (or pay for
// a hardcover, which auto-unlocks) before they see the full story —
// they get a 3-page watermarked preview otherwise. Admins bypass
// everything.
export default async function ReadStoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  const admin = isAdminUser(user);

  // Fetch the visible columns through the user-scoped client (RLS keeps
  // private rows hidden) PLUS a separate admin-side ownership lookup
  // for the owner check. We never hydrate user_id onto the page that
  // the client receives.
  const supa = admin ? supabaseAdmin() : await getSupabaseServer();
  const { data: visible, error } = await supa
    .from("stories")
    .select(PUBLIC_COLUMNS)
    .eq("id", id)
    .single();

  if (error || !visible) {
    // Surface the underlying Supabase/PostgREST error in the server
    // logs — without this the only signal is a generic 404 page, which
    // makes "missing column" / "RLS denied" indistinguishable from a
    // legitimately deleted row. Default console.error of a
    // PostgrestError serializes to `{}` because its properties aren't
    // own-enumerable, so we pull them out by name and JSON-stringify.
    if (error) {
      const e = error as {
        code?: string;
        message?: string;
        details?: string;
        hint?: string;
      };
      console.error("[read/[id]] story load failed:", {
        id,
        userId: user?.id ?? null,
        usedAdminClient: admin,
        code: e.code,
        message: e.message,
        details: e.details,
        hint: e.hint,
        raw: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });
    } else {
      console.error(
        "[read/[id]] story load returned no row (likely RLS or missing id):",
        { id, userId: user?.id ?? null, usedAdminClient: admin }
      );
    }
    notFound();
  }

  // Owner check runs against a separate select that includes user_id —
  // the value never leaves the server.
  let ownerUserId: string | null = null;
  if (user) {
    const { data: ownerRow } = await supabaseAdmin()
      .from("stories")
      .select("user_id")
      .eq("id", id)
      .maybeSingle<{ user_id: string | null }>();
    ownerUserId = ownerRow?.user_id ?? null;
  }

  const story = visible as Omit<StoryRowWithOwner, "user_id"> & {
    user_id?: undefined;
  } satisfies Omit<Story, "user_id" | "pet_id" | "ai_system_prompt" | "prompt"> & {
    digital_unlocked?: boolean;
    is_public?: boolean;
  };

  if (!story.pages || story.pages.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 px-6">
        <p className="text-ink-300">This story has no pages.</p>
        <Link
          href="/read"
          className="text-sm font-semibold text-moss-700 transition-colors hover:text-moss-900"
        >
          Back to library
        </Link>
      </div>
    );
  }

  // Full-access conditions:
  //   - admin
  //   - story is public (is_public=true)
  //   - digital tier unlocked (paid OR backfilled grandfather row)
  //   - closed-beta flag on (the paywall surface is paused so beta
  //     testers can read every story they own without paying)
  // If none of those hold and the viewer is the owner, show the
  // upsell. If they're not the owner, RLS already hid the row above
  // and we never reach this point.
  const fullAccess =
    admin ||
    story.digital_unlocked === true ||
    story.is_public === true ||
    isBetaTesting();
  const isOwner = !!user && !!ownerUserId && ownerUserId === user.id;

  if (!fullAccess && isOwner) {
    return (
      <DigitalUpsell
        story={story as unknown as Story}
        priceUsd={DIGITAL_PRICE_USD}
      />
    );
  }

  // Watermark gate is a separate check from `fullAccess`: beta-testing
  // bypasses the paywall (so beta accounts can read every page) but
  // still shows the watermark, so the funnel can be dogfooded with
  // real previews.
  const cleanImages = storyImagesAreClean(story, { isAdmin: admin });

  return (
    <>
      <SlideReader
        story={story as unknown as Story}
        fullAccess={cleanImages}
      />
      {admin && <AdminExportPdfButton storyId={story.id} />}
    </>
  );
}
