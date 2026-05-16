import { NextResponse, type NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { createJob } from "@/lib/jobs";
import { inngest, EVENTS } from "@/inngest/client";
import type {
  Occasion,
  RecipientType,
  StoryTone,
  WizardPayload,
} from "@/lib/types";

const VALID_RECIPIENTS: RecipientType[] = [
  "partner", "child", "parent", "sibling", "friend", "self", "pet", "other",
];
const VALID_OCCASIONS: Occasion[] = [
  "birthday", "anniversary", "memorial", "just_because", "graduation", "holiday", "new_baby", "other",
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
    if (!body.occasion || !VALID_OCCASIONS.includes(body.occasion)) {
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

    // Verify the cast belongs to this user.
    const admin = supabaseAdmin();
    const { data: ownedCast } = await admin
      .from("characters")
      .select("id")
      .in("id", body.castCharacterIds)
      .eq("user_id", user.id);
    if (!ownedCast || ownedCast.length !== body.castCharacterIds.length) {
      return NextResponse.json({ error: "cast contains unowned characters" }, { status: 403 });
    }

    // Pack outline + keyMemories into stories.prompt (JSON-encoded) so Stage 1
    // can read them back. A dedicated column is a follow-up.
    const promptPayload = JSON.stringify({
      outline: body.outline ?? "",
      keyMemories: body.keyMemories ?? [],
    });

    const { data: story, error: storyErr } = await admin
      .from("stories")
      .insert({
        user_id: user.id,
        title: body.title ?? "Untitled story",
        prompt: promptPayload,
        page_count: pageCount,
        pages: [],
        recipient_type: body.recipientType,
        occasion: body.occasion,
        story_tone: body.storyTone,
        art_style_id: body.artStyleId,
        cast_character_ids: body.castCharacterIds,
        is_public: body.isPublic === true,
      })
      .select("id")
      .single<{ id: string }>();
    if (storyErr || !story) {
      return NextResponse.json({ error: storyErr?.message ?? "create story" }, { status: 500 });
    }

    const jobId = await createJob("story.generate.v2", user.id);
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
