import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/supabase-server";
import { enforceRateLimit, LIMITS, userKey } from "@/lib/rate-limit";

export const maxDuration = 30;

const BUCKET = "uploads";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Image MIME allowlist. SVG is deliberately excluded — when served as
// image/svg+xml on a public storage host it executes embedded scripts
// in that origin (XSS via stored URL). HEIC is allowed for iPhone
// uploads.
const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/gif": "gif",
};

// Magic-byte sniffer for the same set. We don't trust client-supplied
// `file.type` — sniff the first bytes and reject mismatches. Order
// matters: HEIC/HEIF both share an ftyp box at offset 4.
function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // GIF: 47 49 46 38 (37|39) 61
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }
  // WEBP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  // HEIC/HEIF: ....ftyp(heic|heix|mif1|msf1|heif)
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (
      brand === "heic" ||
      brand === "heix" ||
      brand === "mif1" ||
      brand === "msf1"
    ) {
      return "image/heic";
    }
    if (brand === "heif") return "image/heif";
  }
  return null;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const limited = await enforceRateLimit({
    ...LIMITS.upload,
    key: userKey("upload", user.id),
  });
  if (limited) return limited;

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 5 MB)" },
      { status: 413 }
    );
  }

  // Read the bytes once so we can both sniff the magic bytes and hand
  // the buffer to Supabase Storage. Skipping the streaming upload path
  // (which we never used anyway) keeps the logic straightforward.
  const buf = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffMime(buf);
  if (!sniffed || !ALLOWED_MIME[sniffed]) {
    return NextResponse.json(
      {
        error:
          "Unsupported file type. Only PNG, JPEG, WEBP, GIF, and HEIC images are allowed.",
      },
      { status: 415 }
    );
  }

  // Use the sniffed type and the canonical extension — ignore the
  // client-supplied filename/Content-Type completely. Files in the
  // uploads bucket get served with this content-type to the public.
  const ext = ALLOWED_MIME[sniffed];
  const path = `user-uploads/${user.id}/${crypto.randomUUID()}.${ext}`;

  const admin = supabaseAdmin();
  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(path, buf, {
      contentType: sniffed,
      upsert: false,
    });

  if (uploadErr) {
    console.error("[upload] supabase upload failed:", uploadErr);
    return NextResponse.json(
      { error: "Upload failed", details: uploadErr.message },
      { status: 500 }
    );
  }

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
