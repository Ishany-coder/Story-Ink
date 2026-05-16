import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Layer } from "@/lib/types";

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

// Atomic, per-page update of a StoryPage inside the stories.pages JSONB
// array. Uses the `update_story_page_fields` Postgres function so two
// concurrent writers (e.g. the user dragging overlays while the AI is
// regenerating that page's text) don't clobber each other via a
// read-modify-write race on the whole array.
//
// Only shallow top-level StoryPage fields are supported — pass a partial
// object such as { text, overlays, layoutId, imageUrl }. The function
// throws if the page number doesn't exist on the story.
//
// Runs with the service-role client so it bypasses RLS; callers must be
// server-side. The RPC is revoked from anon in schema.sql.
export interface StoryPagePatch {
  text?: string;
  imageUrl?: string;
  watermarkedImageUrl?: string;
  overlays?: Layer[];
  layoutId?: string;
}

export async function updateStoryPageFields(
  storyId: string,
  pageNumber: number,
  patch: StoryPagePatch
): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await admin.rpc("update_story_page_fields", {
    p_story_id: storyId,
    p_page_number: pageNumber,
    p_patch: patch,
  });
  if (error) {
    throw new Error(
      `update_story_page_fields failed: ${error.message ?? String(error)}`
    );
  }
}

// Lower-level uploader for image buffers. Shared between
// uploadGeneratedImage (original AI output) and
// processAndUploadPageImage (which uploads both an original AND a
// watermarked variant). Each attempt picks a fresh UUID path under
// the given prefix so a partially-written object can't collide.
async function uploadBufferToUploads(
  buf: Buffer,
  mime: string,
  pathPrefix: string
): Promise<string> {
  const ext =
    mime === "image/svg+xml" ? "svg" : mime.split("/")[1]?.split("+")[0] || "png";
  const admin = supabaseAdmin();
  const delays = [500, 1500];

  // Storage uploads occasionally fail with ECONNRESET / fetch failed
  // when the underlying fetch connection is reset mid-flight. Retry
  // twice with short backoff before giving up.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const path = `${pathPrefix}/${crypto.randomUUID()}.${ext}`;
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

function decodeDataUri(dataUri: string): { buf: Buffer; mime: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUri);
  if (!match) throw new Error("decodeDataUri: not a base64 data URI");
  const [, mime, b64] = match;
  return { buf: Buffer.from(b64, "base64"), mime };
}

// Upload a base64 data URI (e.g., from Gemini image gen) to the "uploads"
// bucket and return its public URL. Keeps the stories.pages JSONB column
// small — storing inline base64 makes the column too large to round-trip
// on every overlay save and causes PostgREST to drop the connection.
export async function uploadGeneratedImage(dataUri: string): Promise<string> {
  const { buf, mime } = decodeDataUri(dataUri);
  return uploadBufferToUploads(buf, mime, "generated");
}

// Upload the original AND a "StoryInk" watermarked variant of a
// generated page image. Returns both URLs so the caller (the Inngest
// per-page step, the AI page-regen routes) can persist them on
// stories.pages alongside each other.
//
// `imageUrl` stays the canonical original used by the print PDF and
// the canvas editor's save path. `watermarkedImageUrl` is what the
// reader and canvas render to viewers who haven't paid for the story.
//
// Watermark is composited via sharp using an inline SVG: rotated -22°,
// centered, light-but-big "StoryInk" text. Tunable in one place
// (WATERMARK_TEXT / opacities / font-size below) without re-running
// any pipelines for new pages.
export async function processAndUploadPageImage(
  dataUri: string
): Promise<{ imageUrl: string; watermarkedImageUrl: string }> {
  // Lazy import sharp so the rest of supabase.ts can stay importable
  // from any runtime context. Sharp is a native module and only
  // resolves on Node (which is fine for this server-only path).
  const sharp = (await import("sharp")).default;

  const { buf: originalBuf, mime: originalMime } = decodeDataUri(dataUri);

  // Watermarked variant is always PNG so the overlay text antialiases
  // cleanly on top of whatever the source format was.
  let width = 1024;
  let height = 1024;
  try {
    const meta = await sharp(originalBuf).metadata();
    if (meta.width) width = meta.width;
    if (meta.height) height = meta.height;
  } catch {
    // Fall through with defaults — the resulting SVG just gets sized
    // a touch wrong on an unrecognized image; sharp will still
    // composite onto the actual pixel grid.
  }

  const fontSize = Math.round(width / 7);
  const overlaySvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
       <text x="50%" y="50%"
         font-family="Georgia, serif"
         font-weight="700"
         font-size="${fontSize}"
         text-anchor="middle"
         dominant-baseline="middle"
         fill="white" fill-opacity="0.32"
         stroke="black" stroke-opacity="0.16" stroke-width="2"
         transform="rotate(-22 ${width / 2} ${height / 2})"
       >StoryInk</text>
     </svg>`
  );

  const watermarkedBuf = await sharp(originalBuf)
    .composite([{ input: overlaySvg, blend: "over" }])
    .png()
    .toBuffer();

  // Run the two uploads in parallel — they're independent and the
  // page-generation step is already on the slow end of the pipeline.
  const [imageUrl, watermarkedImageUrl] = await Promise.all([
    uploadBufferToUploads(originalBuf, originalMime, "generated"),
    uploadBufferToUploads(watermarkedBuf, "image/png", "generated/watermarked"),
  ]);

  return { imageUrl, watermarkedImageUrl };
}

// Upload an arbitrary blob (currently used for print-ready PDFs from
// pdf-lib) to the "uploads" bucket and return the public URL. Same
// retry shape as uploadGeneratedImage — storage occasionally
// ECONNRESETs on a cold connection.
export async function uploadGeneratedAudio(
  buf: Buffer,
  opts: { mime: string; ext: string; pathPrefix?: string }
): Promise<string> {
  const admin = supabaseAdmin();
  const delays = [500, 1500];
  const prefix = opts.pathPrefix ?? "blob";

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
