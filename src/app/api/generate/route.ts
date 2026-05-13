import { NextRequest, NextResponse } from "next/server";
import { GenerateRequest } from "@/lib/types";
import { createJob } from "@/lib/jobs";
import { inngest } from "@/inngest/client";
import { getCurrentUser } from "@/lib/supabase-server";
import { DEFAULT_IMAGE_STYLE, isImageStyleId } from "@/lib/image-styles";
import { enforceRateLimit, LIMITS, userKey } from "@/lib/rate-limit";
import {
  containsProfanity,
  PROFANITY_REJECTION_MESSAGE,
} from "@/lib/profanity";

// Kicks off the Inngest `story/generate.requested` function. Returns a
// jobId immediately — the client polls /api/jobs/[id] until status is
// "done" (result.storyId) or "failed" (error).
//
// Two flavors of input now:
//   - kind="generic": the original freeform-prompt flow
//   - kind="pet":     petId required; the inngest function pulls the
//                     pet's profile + photos and seeds the prompt
export const maxDuration = 30;

interface PetGenerateBody extends GenerateRequest {
  kind?: "pet" | "generic";
  petId?: string | null;
  // "fast" → parallel image generation with reference photos only
  // "quality" (default) → sequential, page 1 + previous page passed
  // as anchors for cross-page character consistency
  imageMode?: "fast" | "quality";
  isPublic?: boolean;
  // Art-style preset id from src/lib/image-styles.ts. Defaults to
  // watercolor server-side when missing or unknown.
  imageStyle?: string;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Sign in to create a story." },
        { status: 401 }
      );
    }

    const limited = await enforceRateLimit({
      ...LIMITS.generate,
      key: userKey("generate", user.id),
    });
    if (limited) return limited;

    const body = (await request.json()) as PetGenerateBody;
    if (!body.prompt || body.prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }
    if (containsProfanity(body.prompt)) {
      return NextResponse.json(
        { error: PROFANITY_REJECTION_MESSAGE },
        { status: 400 }
      );
    }
    // Practical floor is 6 pages (anything shorter doesn't read like a
    // story). Cap at 800. Stories shorter than 24 pages still generate
    // fine but can't be printed as a hardcover — /ship/[id] gates the
    // hardcover checkout on `pages.length >= 24` and offers digital
    // instead. Clamp aggressively so a malformed client request can't
    // kick off a runaway 10000-page image generation job.
    const pageCount = Math.min(Math.max(body.pageCount || 24, 6), 800);
    const kind = body.kind === "pet" ? "pet" : "generic";
    const petId = kind === "pet" ? body.petId ?? null : null;
    if (kind === "pet" && !petId) {
      return NextResponse.json(
        { error: "petId is required for pet stories" },
        { status: 400 }
      );
    }
    const imageMode = body.imageMode === "fast" ? "fast" : "quality";
    const isPublic = body.isPublic === true;
    const imageStyle = isImageStyleId(body.imageStyle)
      ? body.imageStyle
      : DEFAULT_IMAGE_STYLE;

    const jobId = await createJob("story.generate", user.id);
    await inngest.send({
      name: "story/generate.requested",
      data: {
        jobId,
        userId: user.id,
        prompt: body.prompt,
        pageCount,
        kind,
        petId,
        imageMode,
        isPublic,
        imageStyle,
      },
    });

    return NextResponse.json({ jobId }, { status: 202 });
  } catch (err) {
    console.error("[generate] enqueue failed:", err);
    return NextResponse.json(
      { error: "Failed to enqueue story generation" },
      { status: 500 }
    );
  }
}
