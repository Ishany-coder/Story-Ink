import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { buildInteriorPdf } from "@/lib/print-pdf";
import { enforceRateLimit, LIMITS, userKey } from "@/lib/rate-limit";
import type { Pet, Story } from "@/lib/types";

// Owner / admin / digital-unlocked PDF download. Streams the
// interior PDF (no cover) so the customer can save the story
// they paid for. Same builder as the print pipeline so the file
// matches what they'd get on a printed book minus the casewrap.

export const maxDuration = 60;

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const limited = await enforceRateLimit({
    ...LIMITS.pdf,
    key: userKey("pdf", user.id),
  });
  if (limited) return limited;

  const { id: storyId } = await ctx.params;
  const admin = supabaseAdmin();

  const { data: story, error } = await admin
    .from("stories")
    .select("*")
    .eq("id", storyId)
    .single<
      Story & {
        user_id?: string | null;
        pet_id?: string | null;
        digital_unlocked?: boolean;
        is_public?: boolean;
      }
    >();
  if (error || !story) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Allow when: caller is admin, owns the story, story is public, or
  // digital_unlocked is true (someone paid for it). Otherwise 404 so
  // the route's existence isn't leaked to non-buyers.
  const allowed =
    isAdminUser(user) ||
    story.user_id === user.id ||
    story.is_public ||
    story.digital_unlocked;
  if (!allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let pet: Pet | null = null;
  if (story.pet_id) {
    const { data: petRow } = await admin
      .from("pets")
      .select("*")
      .eq("id", story.pet_id)
      .maybeSingle<Pet>();
    pet = petRow ?? null;
  }

  // Pet privacy gate: a story can be public, but the pet behind it is
  // always private. If the caller is not the pet's owner (and not an
  // admin), hide the pet's PII (name, dates, dedication, photos) from
  // the rendered PDF — dedication pages are skipped and the renderer
  // gets no pet object. Owners and admins always see everything.
  if (pet && pet.user_id !== user.id && !isAdminUser(user)) {
    pet = null;
  }

  let bytes: Uint8Array;
  try {
    bytes = await buildInteriorPdf(story, { pet });
  } catch (err) {
    console.error("[stories/pdf] build failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PDF build failed" },
      { status: 500 }
    );
  }

  const safeTitle =
    (story.title || "story")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "story";

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeTitle}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
