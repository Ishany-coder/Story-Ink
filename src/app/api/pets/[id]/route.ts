import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/supabase-server";
import {
  PET_SPECIES,
  type Pet,
  type PetMode,
  type PetQuirk,
  type PetSpecies,
} from "@/lib/types";

export const maxDuration = 10;

const MAX_PHOTOS = 10;
const MAX_QUIRKS = 30;

function sanitizeQuirks(v: unknown): PetQuirk[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  const out: PetQuirk[] = [];
  for (const q of v) {
    if (!q || typeof q !== "object") return null;
    const r = q as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.answer !== "string") return null;
    const id = r.id.trim().slice(0, 64);
    const answer = r.answer.trim().slice(0, 400);
    if (!id || !answer) continue;
    out.push({ id, answer });
    if (out.length > MAX_QUIRKS) return null;
  }
  return out;
}

function sanitizeStr(v: unknown, max = 200): string | null {
  if (v === null) return null;
  if (typeof v !== "string") return undefined as unknown as string | null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function sanitizePhotos(v: unknown): string[] | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return [];
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const p of v) {
    if (typeof p !== "string") return null;
    const t = p.trim();
    if (!t) continue;
    out.push(t);
    if (out.length > MAX_PHOTOS) return null;
  }
  return out;
}

async function fetchOwnedPet(
  petId: string,
  userId: string
): Promise<Pet | null> {
  const { data } = await supabaseAdmin()
    .from("pets")
    .select("*")
    .eq("id", petId)
    .eq("user_id", userId)
    .maybeSingle<Pet>();
  return data ?? null;
}

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const pet = await fetchOwnedPet(id, user.id);
  if (!pet) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }
  return NextResponse.json({ pet });
}

interface UpdateBody {
  name?: unknown;
  species?: unknown;
  breed?: unknown;
  age?: unknown;
  personality_notes?: unknown;
  mode?: unknown;
  passed_at?: unknown;
  photos?: unknown;
  quirks?: unknown;
  dedication_text?: unknown;
  is_public?: unknown;
}

export async function PATCH(request: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const existing = await fetchOwnedPet(id, user.id);
  if (!existing) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as UpdateBody;

  // Build a partial update — only patch fields the caller actually
  // sent. `undefined` means "leave alone"; explicit null on a
  // nullable field is fine.
  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const v = sanitizeStr(body.name, 80);
    if (!v) {
      return NextResponse.json(
        { error: "name cannot be empty" },
        { status: 400 }
      );
    }
    patch.name = v;
  }
  if (body.species !== undefined) {
    if (
      typeof body.species !== "string" ||
      !(PET_SPECIES as string[]).includes(body.species)
    ) {
      return NextResponse.json(
        { error: "Invalid species" },
        { status: 400 }
      );
    }
    patch.species = body.species as PetSpecies;
  }
  if (body.breed !== undefined) {
    patch.breed =
      body.breed === null ? null : sanitizeStr(body.breed, 80);
  }
  if (body.age !== undefined) {
    patch.age = body.age === null ? null : sanitizeStr(body.age, 40);
  }
  if (body.personality_notes !== undefined) {
    patch.personality_notes =
      body.personality_notes === null
        ? null
        : sanitizeStr(body.personality_notes, 2000);
  }

  // Mode + passed_at interact: switching to memorial requires a date,
  // switching to living clears the date. Validate as a pair.
  const nextMode: PetMode | undefined =
    body.mode === "living" || body.mode === "memorial"
      ? body.mode
      : body.mode === undefined
      ? undefined
      : (() => {
          throw new Error("Invalid mode");
        })();

  if (nextMode !== undefined) patch.mode = nextMode;

  const effectiveMode = nextMode ?? existing.mode;

  if (effectiveMode === "memorial") {
    if (body.passed_at !== undefined) {
      if (typeof body.passed_at !== "string") {
        return NextResponse.json(
          { error: "passed_at must be a YYYY-MM-DD string" },
          { status: 400 }
        );
      }
      const trimmed = body.passed_at.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return NextResponse.json(
          { error: "passed_at must be YYYY-MM-DD" },
          { status: 400 }
        );
      }
      patch.passed_at = trimmed;
    } else if (nextMode === "memorial" && !existing.passed_at) {
      // Switching INTO memorial without supplying a date — reject.
      return NextResponse.json(
        { error: "passed_at is required when switching to memorial mode" },
        { status: 400 }
      );
    }
  } else {
    // Living mode: passed_at must be null. Always clear if the user
    // is actively switching to living, otherwise leave alone.
    if (nextMode === "living") patch.passed_at = null;
  }

  if (body.photos !== undefined) {
    const photos = sanitizePhotos(body.photos);
    if (photos === null) {
      return NextResponse.json(
        { error: `photos must be a list of URLs (max ${MAX_PHOTOS})` },
        { status: 400 }
      );
    }
    patch.photos = photos;
  }

  if (body.dedication_text !== undefined) {
    patch.dedication_text =
      body.dedication_text === null
        ? null
        : sanitizeStr(body.dedication_text, 600);
  }

  if (body.quirks !== undefined) {
    const quirks = sanitizeQuirks(body.quirks);
    if (quirks === null) {
      return NextResponse.json(
        { error: `Invalid quirks payload (max ${MAX_QUIRKS} entries).` },
        { status: 400 }
      );
    }
    patch.quirks = quirks;
  }

  if (body.is_public !== undefined) {
    if (typeof body.is_public !== "boolean") {
      return NextResponse.json(
        { error: "is_public must be a boolean" },
        { status: 400 }
      );
    }
    patch.is_public = body.is_public;
  }

  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin()
    .from("pets")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single<Pet>();

  if (error || !data) {
    console.error("[pets] update failed:", error);
    return NextResponse.json(
      { error: error?.message ?? "Update failed" },
      { status: 500 }
    );
  }
  return NextResponse.json({ pet: data });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const { error } = await supabaseAdmin()
    .from("pets")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[pets] delete failed:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
