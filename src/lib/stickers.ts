import { supabaseAdmin } from "./supabase";
import {
  generateEntityStickerBytes,
  type EntityReference,
  type StickerBytes,
} from "./gemini";
import type { Entity } from "./types";

const BUCKET = "uploads";

// Uploads sticker bytes to the public Storage bucket and returns the URL.
// Uses the service-role client because Storage RLS policies for the anon
// role are a recurring pain point — server-side writes should always run
// with elevated privileges.
export async function uploadStickerBytes(
  storyId: string,
  entityId: string,
  bytes: StickerBytes
): Promise<string> {
  const ext = bytes.mime.split("/")[1] || "png";
  const path = `stickers/${storyId}/${entityId}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(bytes.base64, "base64");

  const admin = supabaseAdmin();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: bytes.mime, upsert: true });

  if (error) {
    throw new Error(`sticker upload failed: ${error.message}`);
  }

  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Generate sticker bytes for an entity AND upload them. Returns both so the
// caller can use the bytes immediately as a Gemini reference and persist the
// URL onto the entity row.
export async function generateAndUploadSticker(
  storyId: string,
  entity: Entity
): Promise<{ bytes: StickerBytes; url: string }> {
  const bytes = await generateEntityStickerBytes(entity);
  const url = await uploadStickerBytes(storyId, entity.id, bytes);
  return { bytes, url };
}

// Upload arbitrary image bytes to Storage under the given path prefix and
// return the public URL. Used by the page-extraction route to persist both
// the chroma-key sticker source and the inpainted page background.
export async function uploadImageBytes(
  pathPrefix: string,
  bytes: StickerBytes
): Promise<string> {
  const ext = bytes.mime.split("/")[1] || "png";
  const path = `${pathPrefix}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(bytes.base64, "base64");

  const admin = supabaseAdmin();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: bytes.mime, upsert: true });

  if (error) {
    throw new Error(`image upload failed: ${error.message}`);
  }

  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Re-fetch a previously uploaded sticker as raw bytes so it can be re-used
// as a Gemini reference image (e.g. when regenerating pages on edit).
export async function fetchStickerBytes(url: string): Promise<StickerBytes> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch sticker ${url}: HTTP ${res.status}`);
  }
  const mime = res.headers.get("content-type") || "image/png";
  const buf = Buffer.from(await res.arrayBuffer());
  return { mime, base64: buf.toString("base64") };
}

// Build the EntityReference list for a set of entities, generating any
// missing stickers and re-fetching existing ones. Entities that fail are
// skipped (logged) so a single bad sticker doesn't break the whole gen.
export async function buildEntityReferences(
  storyId: string,
  entities: Entity[]
): Promise<{ refs: EntityReference[]; updatedEntities: Entity[] }> {
  const updated: Entity[] = [];
  const refs: EntityReference[] = [];

  await Promise.all(
    entities.map(async (entity) => {
      try {
        let bytes: StickerBytes;
        let stickerUrl: string | undefined = entity.stickerUrl;

        if (stickerUrl) {
          bytes = await fetchStickerBytes(stickerUrl);
        } else {
          const result = await generateAndUploadSticker(storyId, entity);
          bytes = result.bytes;
          stickerUrl = result.url;
        }

        updated.push({ ...entity, stickerUrl });
        refs.push({
          name: entity.name,
          type: entity.type,
          description: entity.description,
          mime: bytes.mime,
          base64: bytes.base64,
        });
      } catch (err) {
        console.error(
          `[stickers] failed to prepare reference for ${entity.id}:`,
          err
        );
        // Keep the entity as-is so we don't lose it on the row.
        updated.push(entity);
      }
    })
  );

  // Preserve original entity order so updated[] stays stable.
  const order = new Map(entities.map((e, i) => [e.id, i]));
  updated.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return { refs, updatedEntities: updated };
}
