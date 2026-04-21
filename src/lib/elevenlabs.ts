// Server-only ElevenLabs helpers. Never import this into client components —
// it reads ELEVENLABS_API_KEY from process.env and uses the key directly in
// its requests.

import crypto from "node:crypto";

const API_BASE = "https://api.elevenlabs.io/v1";

export class ElevenLabsError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ElevenLabsError";
    this.status = status;
  }
}

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error(
      "ELEVENLABS_API_KEY is not set. Add it to .env.local from your ElevenLabs dashboard (Profile → API Keys) and restart `next dev`."
    );
  }
  return key;
}

// Instant Voice Cloning. Requires ElevenLabs Creator plan or above.
// Takes the raw audio bytes (whatever format the browser's MediaRecorder
// emitted, or a user-uploaded file) plus a human-readable name. Returns the
// newly-created voice_id, which the client persists in localStorage so the
// user never has to re-record.
export async function cloneVoiceFromSample(args: {
  name: string;
  sampleBlob: Blob;
  sampleFilename: string;
  // Optional consent text that ElevenLabs displays in the dashboard.
  description?: string;
}): Promise<{ voiceId: string }> {
  const form = new FormData();
  form.append("name", args.name);
  if (args.description) form.append("description", args.description);
  form.append("files", args.sampleBlob, args.sampleFilename);

  const res = await fetch(`${API_BASE}/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": getApiKey() },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ElevenLabsError(
      res.status,
      `voice clone failed (${res.status}): ${text.slice(0, 400)}`
    );
  }

  const json = (await res.json()) as { voice_id?: string };
  if (!json.voice_id) {
    throw new ElevenLabsError(500, "voice clone response missing voice_id");
  }
  return { voiceId: json.voice_id };
}

// Delete a previously-cloned voice. Used when the user re-records so they
// don't accumulate dead voices against their account's voice-slot cap.
// Non-fatal — we swallow errors because losing a lingering voice slot is
// strictly better than blocking the re-record flow on an API hiccup.
export async function deleteClonedVoice(voiceId: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/voices/${voiceId}`, {
      method: "DELETE",
      headers: { "xi-api-key": getApiKey() },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[elevenlabs] deleteClonedVoice ${voiceId} failed (${res.status}): ${text.slice(0, 200)}`
      );
    }
  } catch (err) {
    console.warn(`[elevenlabs] deleteClonedVoice ${voiceId} threw:`, err);
  }
}

// Text-to-speech with a cloned voice. Returns the raw mp3 bytes; the caller
// uploads them to Storage and writes the resulting public URL onto the
// page's JSONB so replays don't re-bill.
export async function textToSpeech(args: {
  voiceId: string;
  text: string;
  // Defaults tuned for children's storybook narration: multilingual v2 is
  // expressive enough for character-y reading, output 128kbps mp3.
  modelId?: string;
  outputFormat?: string;
}): Promise<Buffer> {
  const model = args.modelId ?? "eleven_multilingual_v2";
  const outputFormat = args.outputFormat ?? "mp3_44100_128";

  const res = await fetch(
    `${API_BASE}/text-to-speech/${encodeURIComponent(args.voiceId)}?output_format=${outputFormat}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": getApiKey(),
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: args.text,
        model_id: model,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.15,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new ElevenLabsError(
      res.status,
      `TTS failed (${res.status}): ${errText.slice(0, 400)}`
    );
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

// Stable cache key for a (voiceId, text) pair. We hash both so:
//  - Re-saving the same voice with the same text on a page → cache hit.
//  - Editing the page text → hash changes → cache miss → regen.
//  - Re-recording the narrator → voiceId changes → cache miss → regen.
export function narrationCacheKey(voiceId: string, text: string): string {
  return crypto
    .createHash("sha256")
    .update(voiceId)
    .update("|")
    .update(text)
    .digest("hex")
    .slice(0, 24);
}
