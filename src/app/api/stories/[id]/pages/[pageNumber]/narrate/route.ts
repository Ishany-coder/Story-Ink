import { NextResponse } from "next/server";
import {
  supabase,
  updateStoryPageFields,
  uploadGeneratedAudio,
} from "@/lib/supabase";
import {
  ElevenLabsError,
  narrationCacheKey,
  textToSpeech,
} from "@/lib/elevenlabs";
import type { Story } from "@/lib/types";

// TTS can take several seconds for a longer page; give the route runtime
// headroom for multi-paragraph pages even on cold starts.
export const maxDuration = 60;

interface Body {
  voiceId: string;
  // Caller may pass force=true to skip the cache and regenerate — used when
  // the user re-records and wants their new voice on a page they've
  // previously cached with the old voice.
  force?: boolean;
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/stories/[id]/pages/[pageNumber]/narrate">
) {
  const { id, pageNumber } = await ctx.params;
  const pageNum = Number(pageNumber);
  if (!Number.isFinite(pageNum)) {
    return NextResponse.json(
      { error: "Invalid page number" },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const voiceId =
    typeof body.voiceId === "string" ? body.voiceId.trim() : "";
  if (!voiceId) {
    return NextResponse.json(
      { error: "voiceId is required" },
      { status: 400 }
    );
  }

  const { data: story, error: fetchErr } = await supabase
    .from("stories")
    .select("id, pages")
    .eq("id", id)
    .single<Pick<Story, "id" | "pages">>();
  if (fetchErr || !story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  const page = story.pages.find((p) => p.pageNumber === pageNum);
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }
  const text = (page.text ?? "").trim();
  if (!text) {
    return NextResponse.json(
      { error: "Page has no text to narrate" },
      { status: 400 }
    );
  }

  const cacheKey = narrationCacheKey(voiceId, text);

  // Cache hit: return the URL we stored last time.
  if (
    !body.force &&
    page.narrationUrl &&
    page.narrationCacheKey === cacheKey
  ) {
    return NextResponse.json({
      audioUrl: page.narrationUrl,
      cached: true,
    });
  }

  // Cache miss: generate fresh audio.
  let audioUrl: string;
  try {
    const mp3 = await textToSpeech({ voiceId, text });
    audioUrl = await uploadGeneratedAudio(mp3, {
      mime: "audio/mpeg",
      ext: "mp3",
      pathPrefix: `narration/${id}`,
    });
  } catch (err) {
    if (err instanceof ElevenLabsError) {
      console.error("[narrate] elevenlabs error:", err);
      return NextResponse.json(
        { error: err.message },
        { status: err.status === 401 || err.status === 402 ? err.status : 500 }
      );
    }
    console.error("[narrate] unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to generate narration" },
      { status: 500 }
    );
  }

  // Persist the cache on this page atomically so a concurrent overlay
  // save (Studio) doesn't clobber it.
  try {
    await updateStoryPageFields(id, pageNum, {
      narrationUrl: audioUrl,
      narrationCacheKey: cacheKey,
    });
  } catch (updateErr) {
    // Non-fatal: the client still gets the URL; it just won't be cached
    // across requests so next play re-bills. Log loudly.
    console.error(
      "[narrate] failed to persist cache on story; next play will regenerate:",
      updateErr
    );
  }

  return NextResponse.json({ audioUrl, cached: false });
}
