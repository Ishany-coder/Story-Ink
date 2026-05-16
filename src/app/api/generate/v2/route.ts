import { NextResponse, type NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { createJob } from "@/lib/jobs";
import { inngest, EVENTS } from "@/inngest/client";
import { isAllowedContentUrl } from "@/lib/http";
import type {
  MemoryReference,
  Occasion,
  RecipientType,
  StoryTone,
  WizardPayload,
} from "@/lib/types";

const MAX_MEMORY_PHOTOS = 10;
const MAX_CAPTION_LEN = 500;

// Server-side guard for the memories[] array. Mirrors the wizard's
// invariants (max 10, captions required, photo URLs must clear the
// SSRF allowlist) and returns either the sanitized list or a 400-safe
// error message that the route can surface verbatim.
function validateMemories(
  raw: unknown
): { ok: true; memories: MemoryReference[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, memories: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "memories must be an array" };
  }
  if (raw.length > MAX_MEMORY_PHOTOS) {
    return { ok: false, error: `memories must be ≤ ${MAX_MEMORY_PHOTOS}` };
  }
  const out: MemoryReference[] = [];
  const seenIds = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, error: "memory entry must be an object" };
    }
    const m = entry as Record<string, unknown>;
    if (typeof m.id !== "string" || m.id.length === 0) {
      return { ok: false, error: "memory id required" };
    }
    if (seenIds.has(m.id)) {
      return { ok: false, error: `duplicate memory id ${m.id}` };
    }
    if (typeof m.photoUrl !== "string" || !isAllowedContentUrl(m.photoUrl)) {
      return { ok: false, error: "memory photoUrl not in allowlist" };
    }
    if (typeof m.caption !== "string" || m.caption.trim().length === 0) {
      return { ok: false, error: "memory caption required" };
    }
    if (m.caption.length > MAX_CAPTION_LEN) {
      return { ok: false, error: "memory caption too long" };
    }
    seenIds.add(m.id);
    out.push({
      id: m.id,
      photoUrl: m.photoUrl,
      caption: m.caption.trim(),
    });
  }
  return { ok: true, memories: out };
}

const VALID_RECIPIENTS: RecipientType[] = [
  "child", "baby", "partner", "parent", "niece_nephew", "sibling",
  "friend", "grandparent", "pet", "aunt", "uncle", "cousin",
  "family", "self", "other",
];
const VALID_OCCASIONS: Occasion[] = [
  "birthday", "anniversary", "memorial", "just_because", "graduation", "holiday", "new_baby", "achievement",
];
const VALID_TONES: StoryTone[] = ["classic", "rhyming"];

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as WizardPayload & { isPublic?: boolean };

    if (
      !body.recipientType ||
      !VALID_RECIPIENTS.includes(body.recipientType)
    ) {
      return NextResponse.json({ error: "recipientType invalid" }, { status: 400 });
    }
    // Occasion is optional (Step 2 has a "Skip" button). Drafts saved
    // before the "other" → "achievement" rename get silently coerced to
    // unset rather than rejected.
    let occasion: Occasion | undefined = body.occasion;
    if ((occasion as string | undefined) === "other") occasion = undefined;
    if (occasion && !VALID_OCCASIONS.includes(occasion)) {
      return NextResponse.json({ error: "occasion invalid" }, { status: 400 });
    }
    if (!body.storyTone || !VALID_TONES.includes(body.storyTone)) {
      return NextResponse.json({ error: "storyTone invalid" }, { status: 400 });
    }
    if (!body.artStyleId) {
      return NextResponse.json({ error: "artStyleId required" }, { status: 400 });
    }
    if (
      !Array.isArray(body.castCharacterIds) ||
      body.castCharacterIds.length === 0
    ) {
      return NextResponse.json({ error: "cast required" }, { status: 400 });
    }
    const pageCount = Math.min(Math.max(body.pageCount ?? 24, 8), 64);
    // Text-size picker is optional; clamp to a sane range (16–72 logical
    // px). Anything outside falls back to the codebase default.
    let defaultTextSize: number | undefined;
    if (typeof body.defaultTextSize === "number") {
      const n = Math.round(body.defaultTextSize);
      if (n >= 16 && n <= 72) defaultTextSize = n;
    }

    // Sanitize the cast against what the user actually owns. Stale
    // character ids commonly land here when a draft was saved with a
    // character that was later deleted (the wizard's mount-time filter
    // catches most of these, but cross-tab and cross-session deletes
    // can still slip through). Silently drop the dead ids; only fail
    // if every id is gone, in which case we return a 400 with a
    // user-readable message instead of the old silent 403.
    const admin = supabaseAdmin();
    const { data: ownedCast } = await admin
      .from("characters")
      .select("id")
      .in("id", body.castCharacterIds)
      .eq("user_id", user.id);
    const ownedIds = new Set((ownedCast ?? []).map((c) => c.id));
    const sanitizedCast = body.castCharacterIds.filter((id) =>
      ownedIds.has(id)
    );
    if (sanitizedCast.length === 0) {
      return NextResponse.json(
        {
          error:
            "Every character in your cast was removed. Go back to the cast step and re-select at least one.",
        },
        { status: 400 }
      );
    }

    // Memory reference photos: validated server-side so we can trust
    // them in the Inngest pipeline (SSRF allowlist + caption required).
    const memoriesResult = validateMemories(body.memories);
    if (!memoriesResult.ok) {
      return NextResponse.json(
        { error: memoriesResult.error },
        { status: 400 }
      );
    }

    // Pack outline + memories into stories.prompt (JSON-encoded) so Stage 1
    // can read them back. A dedicated column is a follow-up.
    const promptPayload = JSON.stringify({
      outline: body.outline ?? "",
      memories: memoriesResult.memories,
    });

    const { data: story, error: storyErr } = await admin
      .from("stories")
      .insert({
        user_id: user.id,
        title: body.title?.trim() ? body.title.trim() : "Untitled story",
        prompt: promptPayload,
        page_count: pageCount,
        pages: [],
        recipient_type: body.recipientType,
        occasion,
        story_tone: body.storyTone,
        art_style_id: body.artStyleId,
        cast_character_ids: sanitizedCast,
        is_public: body.isPublic === true,
        default_text_size: defaultTextSize ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (storyErr || !story) {
      return NextResponse.json({ error: storyErr?.message ?? "create story" }, { status: 500 });
    }

    // Seed the job's result with { storyId } so the progress page's
    // latest-job poll matches immediately and the user sees the
    // stepper without a couple of seconds of 404 noise.
    const jobId = await createJob("story.generate.v2", user.id, {
      storyId: story.id,
    });
    await inngest.send({
      name: EVENTS.storyGenerateV2,
      data: { jobId, storyId: story.id, userId: user.id },
    });
    return NextResponse.json({ jobId, storyId: story.id }, { status: 202 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
