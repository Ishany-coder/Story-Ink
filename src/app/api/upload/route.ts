import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/supabase-server";

export const maxDuration = 30;

const BUCKET = "uploads";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
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

  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${crypto.randomUUID()}.${ext}`;

  const admin = supabaseAdmin();
  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
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
