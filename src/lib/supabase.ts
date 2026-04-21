import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser-safe client. Uses the public anon key. RLS policies on the
// stories table apply.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Server-only admin client. Uses the service role key, which bypasses RLS
// entirely — must NEVER be imported into client code. Use this in /api
// route handlers and server components for any operation that needs to
// write to Storage or do unrestricted DB work.
//
// Lazily initialized so the rest of the app keeps working in dev even if
// the env var hasn't been set yet — only Storage uploads will fail with a
// clear error message.
let _admin: SupabaseClient | null = null;
export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Get it from Supabase dashboard → Project Settings → API → service_role, and add it to .env.local, then restart `next dev`."
    );
  }
  _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  return _admin;
}

// Upload a base64 data URI (e.g., from Gemini image gen) to the "uploads"
// bucket and return its public URL. Keeps the stories.pages JSONB column
// small — storing inline base64 makes the column too large to round-trip
// on every overlay save and causes PostgREST to drop the connection.
export async function uploadGeneratedImage(dataUri: string): Promise<string> {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUri);
  if (!match) throw new Error("uploadGeneratedImage: not a base64 data URI");
  const [, mime, b64] = match;
  const buf = Buffer.from(b64, "base64");
  const ext =
    mime === "image/svg+xml" ? "svg" : mime.split("/")[1]?.split("+")[0] || "png";

  const admin = supabaseAdmin();
  const delays = [500, 1500];

  // Storage uploads occasionally fail with ECONNRESET / fetch failed when
  // the underlying fetch connection is reset mid-flight. Retry twice with
  // short backoff before giving up. Each attempt uses a fresh UUID path so
  // a partially-written object can't collide.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const path = `generated/${crypto.randomUUID()}.${ext}`;
    try {
      const { error } = await admin.storage
        .from("uploads")
        .upload(path, buf, { contentType: mime, upsert: false });
      if (error) throw error;
      const { data } = admin.storage.from("uploads").getPublicUrl(path);
      return data.publicUrl;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const transient =
        msg.includes("ECONNRESET") ||
        msg.includes("fetch failed") ||
        msg.includes("ETIMEDOUT");
      if (!transient || attempt === 2) break;
      const wait = delays[attempt] ?? 1500;
      console.warn(
        `[storage] upload transient failure, retrying in ${wait}ms:`,
        msg
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

// Upload raw audio bytes (e.g., ElevenLabs mp3) to the "uploads" bucket and
// return the public URL. Same retry shape as uploadGeneratedImage — storage
// occasionally ECONNRESETs on a cold connection.
export async function uploadGeneratedAudio(
  buf: Buffer,
  opts: { mime: string; ext: string; pathPrefix?: string }
): Promise<string> {
  const admin = supabaseAdmin();
  const delays = [500, 1500];
  const prefix = opts.pathPrefix ?? "narration";

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const path = `${prefix}/${crypto.randomUUID()}.${opts.ext}`;
    try {
      const { error } = await admin.storage
        .from("uploads")
        .upload(path, buf, { contentType: opts.mime, upsert: false });
      if (error) throw error;
      const { data } = admin.storage.from("uploads").getPublicUrl(path);
      return data.publicUrl;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const transient =
        msg.includes("ECONNRESET") ||
        msg.includes("fetch failed") ||
        msg.includes("ETIMEDOUT");
      if (!transient || attempt === 2) break;
      const wait = delays[attempt] ?? 1500;
      console.warn(
        `[storage] audio upload transient failure, retrying in ${wait}ms:`,
        msg
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}
