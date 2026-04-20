// One-shot migration: find every inline base64 image stored in stories
// (page.imageUrl, page.overlays[].src, cover_image, library_images) and
// move it to the Supabase Storage "uploads" bucket, rewriting the column
// with the public URL. Run once after rolling out the generate-route
// change that uploads new images instead of inlining them.
//
// Usage (Node 20.6+):
//   node --env-file=.env.local scripts/migrate-inline-images.mjs
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
// Safe to re-run: rows that no longer contain data URIs are skipped.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
      "Run with: node --env-file=.env.local scripts/migrate-inline-images.mjs"
  );
  process.exit(1);
}

const supabase = createClient(url, key);
const BUCKET = "uploads";

function isDataUri(v) {
  return typeof v === "string" && v.startsWith("data:");
}

async function uploadDataUri(dataUri) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUri);
  if (!match) throw new Error("not a base64 data URI");
  const [, mime, b64] = match;
  const buf = Buffer.from(b64, "base64");
  const ext =
    mime === "image/svg+xml"
      ? "svg"
      : mime.split("/")[1]?.split("+")[0] || "png";
  const path = `generated/${randomUUID()}.${ext}`;

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: mime, upsert: false });
    if (!error) {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      return data.publicUrl;
    }
    lastErr = error;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  throw new Error(
    `Storage upload failed (${buf.length} bytes, ${mime}): ${
      lastErr?.message ?? String(lastErr)
    }`
  );
}

// Per-story dedupe: the same data URI is typically referenced from both
// page.imageUrl and the matching overlay image layer, so we upload once
// and reuse the URL.
async function rewriteStory(story) {
  const cache = new Map();
  const getUrl = async (dataUri) => {
    if (cache.has(dataUri)) return cache.get(dataUri);
    const u = await uploadDataUri(dataUri);
    cache.set(dataUri, u);
    return u;
  };

  let changed = false;

  const nextPages = [];
  for (const p of story.pages ?? []) {
    let page = p;
    if (isDataUri(page.imageUrl)) {
      page = { ...page, imageUrl: await getUrl(page.imageUrl) };
      changed = true;
    }
    if (Array.isArray(page.overlays)) {
      const nextOverlays = [];
      let overlaysChanged = false;
      for (const layer of page.overlays) {
        if (layer.type === "image" && isDataUri(layer.src)) {
          nextOverlays.push({ ...layer, src: await getUrl(layer.src) });
          overlaysChanged = true;
        } else {
          nextOverlays.push(layer);
        }
      }
      if (overlaysChanged) {
        page = { ...page, overlays: nextOverlays };
        changed = true;
      }
    }
    nextPages.push(page);
  }

  let nextCover = story.cover_image;
  if (isDataUri(nextCover)) {
    nextCover = await getUrl(nextCover);
    changed = true;
  }

  let nextLibrary = story.library_images;
  if (Array.isArray(nextLibrary) && nextLibrary.some(isDataUri)) {
    nextLibrary = await Promise.all(
      nextLibrary.map((v) => (isDataUri(v) ? getUrl(v) : v))
    );
    changed = true;
  }

  if (!changed) return { changed: false, uploaded: 0 };

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await supabase
      .from("stories")
      .update({
        pages: nextPages,
        cover_image: nextCover,
        library_images: nextLibrary,
      })
      .eq("id", story.id);
    if (!error) return { changed: true, uploaded: cache.size };
    lastErr = error;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  throw new Error(
    `DB update failed: ${lastErr?.message ?? String(lastErr)}`
  );
}

async function main() {
  const { data: stories, error } = await supabase
    .from("stories")
    .select("id, title, pages, cover_image, library_images")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Failed to fetch stories:", error);
    process.exit(1);
  }

  console.log(`Found ${stories.length} stories. Starting migration…`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  let totalUploaded = 0;

  for (const story of stories) {
    try {
      const { changed, uploaded } = await rewriteStory(story);
      if (changed) {
        migrated += 1;
        totalUploaded += uploaded;
        console.log(
          `  ✓ ${story.id} "${story.title}" — uploaded ${uploaded} image(s)`
        );
      } else {
        skipped += 1;
      }
    } catch (err) {
      failed += 1;
      console.error(`  ✗ ${story.id} "${story.title}":`, err.message ?? err);
    }
  }

  console.log(
    `\nDone. migrated=${migrated}, skipped=${skipped}, failed=${failed}, uploads=${totalUploaded}`
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
