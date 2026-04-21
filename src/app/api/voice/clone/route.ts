import { NextResponse } from "next/server";
import { cloneVoiceFromSample, ElevenLabsError } from "@/lib/elevenlabs";

// Accept a voice sample (recorded in the browser or uploaded by the user) and
// kick off Instant Voice Cloning on ElevenLabs. Returns the newly-created
// voice_id, which the client persists in localStorage — the user never has
// to re-record as long as their localStorage is intact.

export const maxDuration = 60;
// 10 MB cap. ElevenLabs IVC accepts up to ~10 min of audio; a short paragraph
// recording is usually well under 1 MB, so this is a generous ceiling.
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data" },
      { status: 400 }
    );
  }

  const file = form.get("file");
  const rawName = form.get("name");
  const consented = form.get("consented");

  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Missing audio file" },
      { status: 400 }
    );
  }
  if (file.size === 0) {
    return NextResponse.json(
      { error: "Audio file is empty" },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Audio file too large (max 10 MB)" },
      { status: 413 }
    );
  }
  if (consented !== "true") {
    // Surface consent as a hard requirement so the UI can't skip the
    // checkbox. ElevenLabs itself also requires consent at the account
    // level, but this is our own guardrail too.
    return NextResponse.json(
      { error: "Voice cloning consent is required" },
      { status: 400 }
    );
  }

  const name =
    typeof rawName === "string" && rawName.trim()
      ? rawName.trim().slice(0, 60)
      : "StoryInk narrator";

  // Infer a reasonable filename + extension from the blob mime. ElevenLabs
  // uses the extension to pick a decoder, so getting this right matters.
  const mime = file.type || "audio/webm";
  const ext =
    mime.includes("webm") ? "webm"
    : mime.includes("mp4") || mime.includes("m4a") ? "m4a"
    : mime.includes("mpeg") || mime.includes("mp3") ? "mp3"
    : mime.includes("wav") ? "wav"
    : mime.includes("ogg") ? "ogg"
    : "webm";
  const filename = `sample.${ext}`;

  try {
    const { voiceId } = await cloneVoiceFromSample({
      name,
      sampleBlob: file,
      sampleFilename: filename,
      description: "Cloned from a StoryInk user recording with explicit consent.",
    });
    return NextResponse.json({ voiceId, name });
  } catch (err) {
    if (err instanceof ElevenLabsError) {
      console.error("[voice/clone] elevenlabs error:", err);
      // 402 typically = plan doesn't support IVC. Pass the upstream message
      // through so the UI can explain why.
      const status = err.status === 402 ? 402 : 500;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error("[voice/clone] unexpected error:", err);
    return NextResponse.json(
      { error: "Voice cloning failed" },
      { status: 500 }
    );
  }
}
