import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/supabase-server";
import {
  PET_SPECIES,
  type CreatePetInput,
  type Pet,
  type PetMode,
  type PetQuirk,
  type PetSpecies,
} from "@/lib/types";

export const maxDuration = 10;

// Safety cap on photos per pet (mirror the schema-level expectation).
// 10 is enough to give Gemini multiple angles without ballooning token
// cost on every page generation.
const MAX_PHOTOS = 10;

function sanitizeStr(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function isPetSpecies(v: unknown): v is PetSpecies {
  return typeof v === "string" && (PET_SPECIES as string[]).includes(v);
}

function isPetMode(v: unknown): v is PetMode {
  return v === "living" || v === "memorial";
}

function sanitizePhotos(v: unknown): string[] | null {
  if (v === undefined || v === null) return [];
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

// Cap to keep the system prompt + token cost reasonable. Bank
// currently has ~20 prompts, so this gives headroom without letting
// a misbehaving client write arbitrarily many entries.
const MAX_QUIRKS = 30;

function sanitizeQuirks(v: unknown): PetQuirk[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  const out: PetQuirk[] = [];
  for (const q of v) {
    if (!q || typeof q !== "object") return null;
    const r = q as Record<string, unknown>;
    if (typeof r.prompt !== "string" || typeof r.answer !== "string") {
      return null;
    }
    const prompt = r.prompt.trim().slice(0, 200);
    const answer = r.answer.trim().slice(0, 400);
    // Drop rows where either field is empty so we don't persist filler.
    if (!prompt || !answer) continue;
    out.push({ prompt, answer });
    if (out.length > MAX_QUIRKS) return null;
  }
  return out;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin()
    .from("pets")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[pets] list failed:", error);
    return NextResponse.json({ error: "Failed to list pets" }, { status: 500 });
  }
  return NextResponse.json({ pets: (data ?? []) as Pet[] });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as CreatePetInput;

  const name = sanitizeStr(body.name, 80);
  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }
  if (!isPetSpecies(body.species)) {
    return NextResponse.json(
      { error: "Invalid species" },
      { status: 400 }
    );
  }
  if (!isPetMode(body.mode)) {
    return NextResponse.json(
      { error: "mode must be 'living' or 'memorial'" },
      { status: 400 }
    );
  }
  // passed_at is required for memorial mode. Living-mode passed_at is
  // ignored even if sent.
  let passedAt: string | null = null;
  if (body.mode === "memorial") {
    const raw = typeof body.passed_at === "string" ? body.passed_at.trim() : "";
    if (!raw) {
      return NextResponse.json(
        { error: "passed_at is required for memorial mode" },
        { status: 400 }
      );
    }
    // Postgres date column accepts YYYY-MM-DD. Reject anything else
    // explicitly so we don't store a free-form string and break the
    // schema's date checks downstream.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return NextResponse.json(
        { error: "passed_at must be YYYY-MM-DD" },
        { status: 400 }
      );
    }
    passedAt = raw;
  }

  const photos = sanitizePhotos(body.photos);
  if (photos === null) {
    return NextResponse.json(
      { error: `photos must be a list of URLs (max ${MAX_PHOTOS})` },
      { status: 400 }
    );
  }

  const quirks = sanitizeQuirks(body.quirks);
  if (quirks === null) {
    return NextResponse.json(
      { error: `Invalid quirks payload (max ${MAX_QUIRKS} entries).` },
      { status: 400 }
    );
  }

  const insert = {
    user_id: user.id,
    name,
    species: body.species,
    breed: sanitizeStr(body.breed, 80),
    age: sanitizeStr(body.age, 40),
    personality_notes: sanitizeStr(body.personality_notes, 2000),
    mode: body.mode,
    passed_at: passedAt,
    photos,
    quirks,
    dedication_text: sanitizeStr(body.dedication_text, 600),
    is_public: body.is_public === true,
  };

  const { data, error } = await supabaseAdmin()
    .from("pets")
    .insert(insert)
    .select("*")
    .single<Pet>();

  if (error || !data) {
    console.error("[pets] insert failed:", error);
    const hint = error?.message ?? "Failed to create pet";
    return NextResponse.json({ error: hint }, { status: 500 });
  }
  return NextResponse.json({ pet: data });
}
