import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import { enforceRateLimit, LIMITS, userKey } from "@/lib/rate-limit";
import type { CustomLayout, Rect } from "@/lib/types";

// UUID v4-ish regex. Strict enough to refuse the PostgREST filter-
// injection vector ("00000000-0000-0000-0000-000000000000),or=(...").
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const maxDuration = 10;

interface Row {
  id: string;
  name: string;
  image_region: Rect;
  text_region: Rect;
  extra_image_regions: Rect[] | null;
  extra_text_regions: Rect[] | null;
  story_id: string | null;
  created_at: string;
}

function rowToLayout(r: Row): CustomLayout {
  return {
    id: r.id,
    name: r.name,
    imageRegion: r.image_region,
    textRegion: r.text_region,
    extraImageRegions: r.extra_image_regions ?? [],
    extraTextRegions: r.extra_text_regions ?? [],
    scope: r.story_id ? "story" : "global",
    storyId: r.story_id ?? undefined,
    createdAt: r.created_at,
  };
}

function isRect(v: unknown): v is Rect {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.x === "number" &&
    typeof r.y === "number" &&
    typeof r.width === "number" &&
    typeof r.height === "number"
  );
}

function toRectArray(v: unknown): Rect[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  const out: Rect[] = [];
  for (const item of v) {
    if (!isRect(item)) return null;
    out.push(item);
  }
  return out;
}

// GET /api/custom-layouts?storyId=<uuid>
// Returns every global layout plus any layouts scoped to the provided story.
// storyId is optional — omit it to fetch globals only.
//
// Requires sign-in. Story-scoped layouts go through RLS via the user-
// scoped server client; the user can only see their own scoped rows.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const url = new URL(request.url);
  const storyIdRaw = url.searchParams.get("storyId");
  const storyId =
    storyIdRaw && UUID_RE.test(storyIdRaw) ? storyIdRaw : null;
  if (storyIdRaw && !storyId) {
    return NextResponse.json(
      { error: "storyId must be a UUID" },
      { status: 400 }
    );
  }

  // Build the filter via the typed query builder rather than raw
  // string interpolation — defends against any future PostgREST
  // filter-grammar quirks even though storyId is already UUID-validated.
  const supa = await getSupabaseServer();
  const baseQuery = supa
    .from("custom_layouts")
    .select(
      "id, name, image_region, text_region, extra_image_regions, extra_text_regions, story_id, created_at"
    )
    .order("created_at", { ascending: false });

  const { data, error } = await (storyId
    ? baseQuery.or(`story_id.is.null,story_id.eq.${storyId}`)
    : baseQuery.is("story_id", null));

  if (error) {
    console.error("[custom-layouts] list failed:", error);
    return NextResponse.json(
      { error: "Failed to list custom layouts" },
      { status: 500 }
    );
  }

  return NextResponse.json({ layouts: (data as Row[]).map(rowToLayout) });
}

interface CreateBody {
  name?: unknown;
  imageRegion?: unknown;
  textRegion?: unknown;
  extraImageRegions?: unknown;
  extraTextRegions?: unknown;
  storyId?: unknown;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const limited = await enforceRateLimit({
    ...LIMITS.customLayouts,
    key: userKey("customLayouts", user.id),
  });
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as CreateBody;

  const name =
    typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  if (!name) {
    return NextResponse.json(
      { error: "Name is required" },
      { status: 400 }
    );
  }
  if (!isRect(body.imageRegion) || !isRect(body.textRegion)) {
    return NextResponse.json(
      { error: "imageRegion and textRegion must be rectangles" },
      { status: 400 }
    );
  }
  const extraImages = toRectArray(body.extraImageRegions);
  const extraTexts = toRectArray(body.extraTextRegions);
  if (extraImages === null || extraTexts === null) {
    return NextResponse.json(
      { error: "extraImageRegions/extraTextRegions must be rectangle arrays" },
      { status: 400 }
    );
  }
  const storyId =
    typeof body.storyId === "string" && body.storyId ? body.storyId : null;

  const { data, error } = await supabaseAdmin()
    .from("custom_layouts")
    .insert({
      name,
      image_region: body.imageRegion,
      text_region: body.textRegion,
      extra_image_regions: extraImages,
      extra_text_regions: extraTexts,
      story_id: storyId,
      user_id: user.id,
    })
    .select(
      "id, name, image_region, text_region, extra_image_regions, extra_text_regions, story_id, created_at"
    )
    .single<Row>();

  if (error || !data) {
    console.error("[custom-layouts] insert failed:", error);
    // Surface the Supabase message so the Studio can show a specific hint
    // (e.g. "relation public.custom_layouts does not exist" → the schema
    // migration hasn't been applied yet). Fall back to a generic string.
    const hint =
      error?.message ?? error?.details ?? "Failed to save layout";
    return NextResponse.json({ error: hint }, { status: 500 });
  }

  return NextResponse.json({ layout: rowToLayout(data) });
}
