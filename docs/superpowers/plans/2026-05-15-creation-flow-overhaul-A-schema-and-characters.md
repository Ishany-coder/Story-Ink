# Plan A — Schema + Character Library

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the new data model (drop `pets`, add `characters`, `character_portraits`, `story_drafts`, `art_styles`, mutate `stories`), seed the curated art-style catalog, and ship a working `/characters` library page for CRUD of people + pets in one unified shape.

**Architecture:** This plan is data-layer-first. It mutates `supabase/schema.sql`, adds a seed file, adds a unified `Character` type, builds character CRUD helpers and routes, and ships the standalone `/characters` library page. The wizard, the new generation pipeline, and V1 deletion are deferred to later plans.

**Tech Stack:** Next.js 16 App Router (`src/proxy.ts` runs auth refresh), React 19, Supabase (Postgres + Auth + Storage), `@supabase/ssr`. No test runner is configured — verification is `npm run lint`, `npm run build`, and manual smoke tests.

**Spec:** `docs/superpowers/specs/2026-05-15-creation-flow-overhaul-design.md`

---

## File map

**Created**
- `supabase/seed-art-styles.sql`
- `public/art-style-samples/<style_id>.svg` (10–14 SVG placeholders, one per style)
- `src/lib/characters.ts` — server-only CRUD helpers
- `src/app/api/characters/route.ts` — `GET` list + `POST` create
- `src/app/api/characters/[id]/route.ts` — `GET` single + `PATCH` + `DELETE`
- `src/app/characters/page.tsx` — list view
- `src/app/characters/new/page.tsx` — create form
- `src/app/characters/[id]/page.tsx` — edit form
- `src/components/CharacterForm.tsx`
- `src/components/CharacterCard.tsx`

**Modified**
- `supabase/schema.sql` — drop `pets`, alter `stories`, add 4 new tables + RLS
- `src/lib/types.ts` — add `Character`, `CharacterKind`, `CharacterPortrait`, `StoryDraft`, `ArtStyle` types
- `src/components/Navbar.tsx` — link "Characters" (in Plan D we'll remove the old "Pets" link; for now it can sit alongside)

---

## Task 1 — Rewrite `supabase/schema.sql` (data wipe + table changes)

**Files:**
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Wipe V1 data + drop `pets`.** Open `supabase/schema.sql` and **prepend** the following block right under the file's leading comment (above the `Pets` section that exists today). This runs first on every re-run; idempotent because the truncates and drops are no-ops on a fresh DB.

```sql
-- ---------------------------------------------------------------------------
-- V2 cutover (creation flow overhaul, 2026-05-15)
-- App is pre-production. Hard wipe of V1 story / pet / job / order data
-- before the new schema applies. Order matters: print_order_events
-- references print_orders, which references stories; custom_layouts also
-- references stories. Use CASCADE on the truncate to keep this single-
-- statement-safe.
-- ---------------------------------------------------------------------------

truncate table
  public.print_order_events,
  public.print_orders,
  public.custom_layouts,
  public.jobs,
  public.stories
  restart identity cascade;

-- Drop pets entirely. The new schema replaces it with `characters` below.
drop table if exists public.pets cascade;
```

- [ ] **Step 2: Delete the `Pets` section.** In `supabase/schema.sql`, delete the entire section from the comment `-- Pets` through the last `pets ...` policy (lines 11–89 in the current file). The block we added in Step 1 handles the drop.

- [ ] **Step 3: Strip pet references from the `Stories` section.** In the `Stories` section of `supabase/schema.sql`, remove:
  - The `pet_id uuid references public.pets(id) on delete set null` column add (currently part of the multi-column `add column if not exists ...` block).
  - The `kind text not null default 'generic' check (kind in ('pet','generic'))` column add.
  - The `image_style text not null default 'watercolor'` column add.
  - The `create index if not exists stories_pet_id_idx on public.stories (pet_id);` line.
  - The `page_count between 6 and 800` constraint, replaced below.

Replace the `add column` block for stories with:

```sql
alter table public.stories
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists is_public boolean not null default false,
  -- V2 columns
  add column if not exists recipient_type text,
  add column if not exists occasion text,
  add column if not exists art_style_id text,
  add column if not exists story_tone text default 'classic'
    check (story_tone in ('classic','rhyming')),
  add column if not exists script jsonb,
  add column if not exists cast_character_ids uuid[] not null default '{}';

-- Drop legacy pet/style columns if a prior schema run created them.
alter table public.stories drop column if exists pet_id;
alter table public.stories drop column if exists kind;
alter table public.stories drop column if exists image_style;

-- Tighten the page_count range for V2 (8..64).
alter table public.stories drop constraint if exists stories_page_count_check;
alter table public.stories add constraint stories_page_count_check
  check (page_count between 8 and 64);
```

- [ ] **Step 4: Add the new `characters` table.** Insert the following block in `supabase/schema.sql` after the `Stories` section and before `Jobs`:

```sql
-- ---------------------------------------------------------------------------
-- Characters (V2: replaces pets; unifies people + pets in one shape)
-- ---------------------------------------------------------------------------

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('person','pet')),
  name text not null,
  role_label text,
  traits text,
  species text,                       -- nullable; only set when kind='pet'
  reference_photo_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists characters_user_id_idx on public.characters (user_id);
create index if not exists characters_created_at_idx
  on public.characters (created_at desc);

alter table public.characters enable row level security;

drop policy if exists "characters visible to owner" on public.characters;
create policy "characters visible to owner"
  on public.characters for select
  using (user_id = auth.uid());

drop policy if exists "characters insert by owner" on public.characters;
create policy "characters insert by owner"
  on public.characters for insert
  with check (user_id = auth.uid());

drop policy if exists "characters update by owner" on public.characters;
create policy "characters update by owner"
  on public.characters for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "characters delete by owner" on public.characters;
create policy "characters delete by owner"
  on public.characters for delete
  using (user_id = auth.uid());
```

- [ ] **Step 5: Add `art_styles`, `character_portraits`, `story_drafts`.** Append the following block to `supabase/schema.sql` after the `characters` block:

```sql
-- ---------------------------------------------------------------------------
-- Art styles (V2: curated catalog)
-- ---------------------------------------------------------------------------

create table if not exists public.art_styles (
  id text primary key,
  display_name text not null,
  description text,
  prompt_scaffold text not null,
  sample_image_urls text[] not null default '{}',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.art_styles enable row level security;

-- Anyone signed in (or anon, for the public marketing tile we may build
-- later) can read the active style catalog. Writes are service-role only.
drop policy if exists "art styles readable" on public.art_styles;
create policy "art styles readable"
  on public.art_styles for select
  using (true);

revoke insert, update, delete on public.art_styles from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Character portraits (V2: per-(character, style) cached canonical portrait)
-- ---------------------------------------------------------------------------

create table if not exists public.character_portraits (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  art_style_id text not null references public.art_styles(id),
  portrait_url text not null,
  generated_at timestamptz not null default now(),
  unique (character_id, art_style_id)
);

create index if not exists character_portraits_character_idx
  on public.character_portraits (character_id);

alter table public.character_portraits enable row level security;

drop policy if exists "character portraits readable by owner"
  on public.character_portraits;
create policy "character portraits readable by owner"
  on public.character_portraits for select
  using (
    exists (
      select 1 from public.characters c
      where c.id = character_portraits.character_id
        and c.user_id = auth.uid()
    )
  );

-- Writes are service-role only (Inngest functions populate this).
revoke insert, update, delete on public.character_portraits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Story drafts (V2: wizard auto-save)
-- ---------------------------------------------------------------------------

create table if not exists public.story_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  current_step smallint not null default 1 check (current_step between 1 and 7),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists story_drafts_user_id_idx on public.story_drafts (user_id);
create index if not exists story_drafts_updated_at_idx
  on public.story_drafts (updated_at desc);

alter table public.story_drafts enable row level security;

drop policy if exists "drafts visible to owner" on public.story_drafts;
create policy "drafts visible to owner"
  on public.story_drafts for select
  using (user_id = auth.uid());

drop policy if exists "drafts insert by owner" on public.story_drafts;
create policy "drafts insert by owner"
  on public.story_drafts for insert
  with check (user_id = auth.uid());

drop policy if exists "drafts update by owner" on public.story_drafts;
create policy "drafts update by owner"
  on public.story_drafts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "drafts delete by owner" on public.story_drafts;
create policy "drafts delete by owner"
  on public.story_drafts for delete
  using (user_id = auth.uid());
```

- [ ] **Step 6: Run the migration against the local Supabase project.**

Run: `cat supabase/schema.sql` and verify the file reads top-to-bottom without leftover `pets` references (search for `pets` — only matches should be in the V2 wipe block and any incidental comments).

Then apply the schema. The repo doesn't ship a local `supabase` CLI binary; the assumed workflow per `CLAUDE.md` is to paste the file into the Supabase SQL editor. Run:

```bash
pbcopy < supabase/schema.sql
echo "schema.sql copied to clipboard — paste into Supabase SQL editor and run"
```

Expected: clipboard now contains the file. The user runs it in Supabase manually; agentic execution should pause here and report.

- [ ] **Step 7: Commit.**

```bash
git add supabase/schema.sql
git commit -m "supabase: V2 cutover — drop pets, add characters/portraits/drafts/styles"
```

---

## Task 2 — Seed `art_styles` + placeholder sample SVGs

**Files:**
- Create: `supabase/seed-art-styles.sql`
- Create: `public/art-style-samples/whimsy_watercolor.svg`, `whiteboard_crayon.svg`, `sketch_magic.svg`, `superhero_comic.svg`, `cartoon_adventure.svg`, `color_paper_cutouts.svg`, `folk_tale_storybook.svg`, `studio_ghibli.svg`, `soft_romantic.svg`

- [ ] **Step 1: Create the seed file.**

Write `supabase/seed-art-styles.sql`:

```sql
-- Curated art-style catalog for V2 creation flow.
-- Re-runnable: upserts on (id).
--
-- Sample images live under public/art-style-samples/<id>.svg and are
-- served at /art-style-samples/<id>.svg by Next.js's public/ asset
-- handling. The seed stores the relative URL; the UI prepends the
-- origin at render time (or uses next/image with src={...}).

insert into public.art_styles (id, display_name, description, prompt_scaffold, sample_image_urls, sort_order, is_active)
values
  ('whimsy_watercolor',  'Whimsy Watercolor',  'Soft, dreamy watercolor with hand-drawn line work.',
    'illustrated in soft watercolor with gentle washes of color, hand-drawn line work, dreamy lighting, painterly texture',
    array['/art-style-samples/whimsy_watercolor.svg'], 1, true),
  ('whiteboard_crayon',  'Whiteboard Crayon',  'Energetic crayon-on-paper with bold outlines.',
    'crayon-style illustration on white paper, bold colored outlines, slightly textured strokes, playful energy',
    array['/art-style-samples/whiteboard_crayon.svg'], 2, true),
  ('sketch_magic',       'Sketch Magic',       'Lightly shaded pencil sketch with hints of color.',
    'pencil sketch illustration, soft graphite shading, light hand-applied color washes, storybook quality',
    array['/art-style-samples/sketch_magic.svg'], 3, true),
  ('superhero_comic',    'Superhero Comic',    'Punchy comic-book panels with bold ink and color blocks.',
    'comic book illustration, bold ink outlines, flat saturated color, halftone shading, dynamic poses',
    array['/art-style-samples/superhero_comic.svg'], 4, true),
  ('cartoon_adventure',  'Cartoon Adventure',  'Bright animated-cartoon style with rounded shapes.',
    'cheerful animated cartoon illustration, rounded forms, bright saturated palette, soft cel shading',
    array['/art-style-samples/cartoon_adventure.svg'], 5, true),
  ('color_paper_cutouts','Color Paper Cutouts','Layered cut-paper collage with visible paper textures.',
    'cut-paper collage illustration, layered construction paper with visible texture, simple silhouettes, gentle shadows',
    array['/art-style-samples/color_paper_cutouts.svg'], 6, true),
  ('folk_tale_storybook','Folk Tale Storybook','Stylized folk-art prints with rich pattern work.',
    'folk-art storybook illustration, ornamental patterns, rich earthy palette, flat stylized figures',
    array['/art-style-samples/folk_tale_storybook.svg'], 7, true),
  ('studio_ghibli',      'Studio Ghibli',      'Hand-painted anime backgrounds with magical realism.',
    'hand-painted illustration in the style of classic Japanese animated films, atmospheric lighting, painterly backgrounds, gentle realism',
    array['/art-style-samples/studio_ghibli.svg'], 8, true),
  ('soft_romantic',      'Soft Romantic',      'Pastel, blushy romantic illustration.',
    'soft romantic illustration, blush and pastel palette, gentle linework, decorative hearts and florals',
    array['/art-style-samples/soft_romantic.svg'], 9, true)
on conflict (id) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  prompt_scaffold = excluded.prompt_scaffold,
  sample_image_urls = excluded.sample_image_urls,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;
```

- [ ] **Step 2: Generate placeholder SVG samples.** Each style needs a recognizable thumbnail. For v1 these are SVG placeholders with the style name on a tinted background; real samples can replace them later.

For each of the 9 styles above, create `public/art-style-samples/<id>.svg` using this template (substitute `<DISPLAY NAME>` and `<HEX>`):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="<HEX>"/>
  <text x="200" y="155" text-anchor="middle" font-family="Georgia, serif" font-size="28" font-weight="600" fill="#1a1a1a">
    <DISPLAY NAME>
  </text>
  <text x="200" y="185" text-anchor="middle" font-family="Georgia, serif" font-size="13" fill="#666">
    sample placeholder
  </text>
</svg>
```

Use these colors:
- whimsy_watercolor → `#cfe0f1`
- whiteboard_crayon → `#fff3b0`
- sketch_magic → `#ece9e1`
- superhero_comic → `#ffd1a1`
- cartoon_adventure → `#bde7a8`
- color_paper_cutouts → `#f7c7b8`
- folk_tale_storybook → `#d8c4a0`
- studio_ghibli → `#b6d9c2`
- soft_romantic → `#f7d4dc`

- [ ] **Step 3: Apply the seed.**

Run: `pbcopy < supabase/seed-art-styles.sql && echo "seed-art-styles.sql copied — paste + run in Supabase SQL editor"`. The user pastes + runs.

- [ ] **Step 4: Verify the seed landed.** Manual verification — open the Supabase Table Editor → `art_styles` → confirm 9 rows are present with sort_order 1..9. Report status in the executing transcript.

- [ ] **Step 5: Commit.**

```bash
git add supabase/seed-art-styles.sql public/art-style-samples
git commit -m "art-styles: seed catalog + placeholder sample SVGs"
```

---

## Task 3 — Add V2 types to `src/lib/types.ts`

**Files:**
- Modify: `src/lib/types.ts` (append; do not remove existing Pet types in this plan — Plan D handles that)

- [ ] **Step 1: Append the new types.**

At the bottom of `src/lib/types.ts`, append:

```ts
// ---------------------------------------------------------------------------
// V2 character + draft + art-style types
// ---------------------------------------------------------------------------

export type CharacterKind = "person" | "pet";

export interface Character {
  id: string;
  user_id: string;
  kind: CharacterKind;
  name: string;
  role_label: string | null;
  traits: string | null;
  species: string | null;
  reference_photo_urls: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateCharacterInput {
  kind: CharacterKind;
  name: string;
  role_label?: string | null;
  traits?: string | null;
  species?: string | null;
  reference_photo_urls?: string[];
}

export type UpdateCharacterInput = Partial<CreateCharacterInput>;

export interface CharacterPortrait {
  id: string;
  character_id: string;
  art_style_id: string;
  portrait_url: string;
  generated_at: string;
}

export interface ArtStyle {
  id: string;
  display_name: string;
  description: string | null;
  prompt_scaffold: string;
  sample_image_urls: string[];
  sort_order: number;
  is_active: boolean;
}

export type RecipientType =
  | "partner"
  | "child"
  | "parent"
  | "sibling"
  | "friend"
  | "self"
  | "pet"
  | "other";

export type Occasion =
  | "birthday"
  | "anniversary"
  | "memorial"
  | "just_because"
  | "graduation"
  | "holiday"
  | "new_baby"
  | "other";

export type StoryTone = "classic" | "rhyming";

export interface WizardPayload {
  recipientType?: RecipientType;
  occasion?: Occasion;
  castCharacterIds?: string[];
  outline?: string;
  keyMemories?: string[];
  artStyleId?: string;
  storyTone?: StoryTone;
  pageCount?: number;
  title?: string;
}

export interface StoryDraft {
  id: string;
  user_id: string;
  title: string | null;
  current_step: number; // 1..7
  payload: WizardPayload;
  created_at: string;
  updated_at: string;
}

// V2 script (output of Stage 1 — generated by Plan B).
export interface ScriptPage {
  pageNumber: number;
  text: string;
  sceneDescription: string;
  characterIds: string[];
}

export interface Script {
  title: string;
  dedication?: string;
  pages: ScriptPage[];
}
```

- [ ] **Step 2: Type-check.**

Run: `npm run build`
Expected: build completes without TS errors. (`next build` runs the TS compiler.) If there are unrelated TS errors from existing code, do NOT fix them here — they're Plan D territory.

- [ ] **Step 3: Commit.**

```bash
git add src/lib/types.ts
git commit -m "types: add V2 Character/StoryDraft/ArtStyle/Wizard types"
```

---

## Task 4 — Character CRUD helpers (`src/lib/characters.ts`)

**Files:**
- Create: `src/lib/characters.ts`

- [ ] **Step 1: Write the helper module.**

Create `src/lib/characters.ts`:

```ts
import { supabaseAdmin } from "@/lib/supabase";
import type {
  Character,
  CreateCharacterInput,
  UpdateCharacterInput,
} from "@/lib/types";

const MAX_PHOTOS_PER_CHARACTER = 5;

function clampPhotos(urls: string[] | undefined): string[] {
  if (!urls) return [];
  return urls.slice(0, MAX_PHOTOS_PER_CHARACTER);
}

export async function listCharactersForUser(userId: string): Promise<Character[]> {
  const { data, error } = await supabaseAdmin()
    .from("characters")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listCharactersForUser: ${error.message}`);
  return (data ?? []) as Character[];
}

export async function getCharacterForUser(
  characterId: string,
  userId: string
): Promise<Character | null> {
  const { data, error } = await supabaseAdmin()
    .from("characters")
    .select("*")
    .eq("id", characterId)
    .eq("user_id", userId)
    .maybeSingle<Character>();
  if (error) throw new Error(`getCharacterForUser: ${error.message}`);
  return data;
}

export async function createCharacterForUser(
  userId: string,
  input: CreateCharacterInput
): Promise<Character> {
  if (!input.name?.trim()) throw new Error("name is required");
  if (input.kind !== "person" && input.kind !== "pet") {
    throw new Error("kind must be 'person' or 'pet'");
  }
  const row = {
    user_id: userId,
    kind: input.kind,
    name: input.name.trim(),
    role_label: input.role_label?.trim() || null,
    traits: input.traits?.trim() || null,
    species: input.kind === "pet" ? input.species?.trim() || null : null,
    reference_photo_urls: clampPhotos(input.reference_photo_urls),
  };
  const { data, error } = await supabaseAdmin()
    .from("characters")
    .insert(row)
    .select("*")
    .single<Character>();
  if (error || !data) throw new Error(`createCharacterForUser: ${error?.message}`);
  return data;
}

export async function updateCharacterForUser(
  characterId: string,
  userId: string,
  patch: UpdateCharacterInput
): Promise<Character> {
  // Confirm ownership first; admin client bypasses RLS.
  const existing = await getCharacterForUser(characterId, userId);
  if (!existing) throw new Error("character not found");

  const nextKind = patch.kind ?? existing.kind;
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.role_label !== undefined)
    update.role_label = patch.role_label?.trim() || null;
  if (patch.traits !== undefined)
    update.traits = patch.traits?.trim() || null;
  if (patch.kind !== undefined) update.kind = patch.kind;
  // species only retained when kind is 'pet'.
  if (patch.species !== undefined || patch.kind !== undefined) {
    update.species =
      nextKind === "pet"
        ? (patch.species ?? existing.species)?.trim() || null
        : null;
  }
  if (patch.reference_photo_urls !== undefined) {
    update.reference_photo_urls = clampPhotos(patch.reference_photo_urls);
  }

  const { data, error } = await supabaseAdmin()
    .from("characters")
    .update(update)
    .eq("id", characterId)
    .eq("user_id", userId)
    .select("*")
    .single<Character>();
  if (error || !data) throw new Error(`updateCharacterForUser: ${error?.message}`);
  return data;
}

export async function deleteCharacterForUser(
  characterId: string,
  userId: string
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("characters")
    .delete()
    .eq("id", characterId)
    .eq("user_id", userId);
  if (error) throw new Error(`deleteCharacterForUser: ${error.message}`);
}

export const CHARACTER_LIMITS = { maxPhotos: MAX_PHOTOS_PER_CHARACTER };
```

- [ ] **Step 2: Type-check.**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit.**

```bash
git add src/lib/characters.ts
git commit -m "characters: add server-side CRUD helpers"
```

---

## Task 5 — API routes: `/api/characters`

**Files:**
- Create: `src/app/api/characters/route.ts`
- Create: `src/app/api/characters/[id]/route.ts`

- [ ] **Step 1: Write the collection route.**

Create `src/app/api/characters/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/supabase-server";
import {
  createCharacterForUser,
  listCharactersForUser,
} from "@/lib/characters";
import type { CreateCharacterInput } from "@/lib/types";

export async function GET() {
  try {
    const user = await requireUser();
    const characters = await listCharactersForUser(user.id);
    return NextResponse.json({ characters });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as CreateCharacterInput;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    const character = await createCharacterForUser(user.id, body);
    return NextResponse.json({ character }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
```

- [ ] **Step 2: Write the per-id route.**

Create `src/app/api/characters/[id]/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/supabase-server";
import {
  deleteCharacterForUser,
  getCharacterForUser,
  updateCharacterForUser,
} from "@/lib/characters";
import type { UpdateCharacterInput } from "@/lib/types";

// Next.js 16: route handler params are async.
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const character = await getCharacterForUser(id, user.id);
    if (!character) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ character });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as UpdateCharacterInput;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    const character = await updateCharacterForUser(id, user.id, body);
    return NextResponse.json({ character });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg === "character not found" ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    await deleteCharacterForUser(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 3: Type-check.**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Commit.**

```bash
git add src/app/api/characters
git commit -m "api: add /api/characters CRUD routes"
```

---

## Task 6 — `CharacterForm` component

**Files:**
- Create: `src/components/CharacterForm.tsx`

- [ ] **Step 1: Write the form component.**

Create `src/components/CharacterForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Character, CharacterKind } from "@/lib/types";

const MAX_PHOTOS = 5;

type Props = {
  initial: Character | null;
};

export default function CharacterForm({ initial }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<CharacterKind>(initial?.kind ?? "person");
  const [name, setName] = useState(initial?.name ?? "");
  const [roleLabel, setRoleLabel] = useState(initial?.role_label ?? "");
  const [traits, setTraits] = useState(initial?.traits ?? "");
  const [species, setSpecies] = useState(initial?.species ?? "");
  const [photos, setPhotos] = useState<string[]>(
    initial?.reference_photo_urls ?? []
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (photos.length >= MAX_PHOTOS) {
      setError(`Max ${MAX_PHOTOS} photos`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const { url } = (await res.json()) as { url: string };
      setPhotos((prev) => [...prev, url]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        kind,
        name,
        role_label: roleLabel || null,
        traits: traits || null,
        species: kind === "pet" ? species || null : null,
        reference_photo_urls: photos,
      };
      const url = initial ? `/api/characters/${initial.id}` : "/api/characters";
      const method = initial ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push("/characters");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    if (!confirm(`Delete ${initial.name}?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/characters/${initial.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      router.push("/characters");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">Type</label>
        <div className="flex gap-2">
          {(["person", "pet"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`px-4 py-2 rounded border ${
                kind === k ? "bg-black text-white" : "bg-white"
              }`}
            >
              {k === "person" ? "Person" : "Pet"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Name</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border rounded px-3 py-2"
          placeholder={kind === "person" ? "e.g. Maya" : "e.g. Buddy"}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Role label (optional)
        </label>
        <input
          value={roleLabel ?? ""}
          onChange={(e) => setRoleLabel(e.target.value)}
          className="w-full border rounded px-3 py-2"
          placeholder='e.g. "Mom", "the hero"'
        />
      </div>

      {kind === "pet" && (
        <div>
          <label className="block text-sm font-medium mb-2">
            Species (optional)
          </label>
          <input
            value={species ?? ""}
            onChange={(e) => setSpecies(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="dog, cat, etc."
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-2">
          Traits / personality (optional)
        </label>
        <textarea
          value={traits ?? ""}
          onChange={(e) => setTraits(e.target.value)}
          rows={3}
          className="w-full border rounded px-3 py-2"
          placeholder="What makes them them? Quirks, hobbies, favorite things…"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Reference photos ({photos.length}/{MAX_PHOTOS})
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {photos.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <div key={src} className="relative">
              <img
                src={src}
                alt=""
                className="w-24 h-24 object-cover rounded border"
              />
              <button
                type="button"
                onClick={() =>
                  setPhotos((prev) => prev.filter((_, j) => j !== i))
                }
                className="absolute -top-2 -right-2 bg-white border rounded-full w-6 h-6 text-xs"
                aria-label="remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
          disabled={uploading || photos.length >= MAX_PHOTOS}
        />
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || uploading || !name.trim()}
          className="px-4 py-2 bg-black text-white rounded disabled:opacity-50"
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Add character"}
        </button>
        {initial && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="px-4 py-2 border rounded text-red-600"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
```

> **Note:** This uses `/api/upload` which already exists. Verify by reading `src/app/api/upload/route.ts` — it should accept multipart form with `file` and return `{ url }`. If the shape differs (older returns differently), adjust the fetch handler in this component to match.

- [ ] **Step 2: Type-check.**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit.**

```bash
git add src/components/CharacterForm.tsx
git commit -m "components: add CharacterForm (create/edit)"
```

---

## Task 7 — `CharacterCard` component

**Files:**
- Create: `src/components/CharacterCard.tsx`

- [ ] **Step 1: Write the card.**

Create `src/components/CharacterCard.tsx`:

```tsx
import Link from "next/link";
import type { Character } from "@/lib/types";

export default function CharacterCard({ character }: { character: Character }) {
  const photo = character.reference_photo_urls[0];
  return (
    <Link
      href={`/characters/${character.id}`}
      className="block rounded-lg border bg-white hover:shadow-sm transition overflow-hidden"
    >
      <div className="aspect-square bg-stone-100 flex items-center justify-center">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={character.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-stone-400 text-sm">No photo yet</span>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span className="font-medium">{character.name}</span>
          <span className="text-xs uppercase tracking-wide text-stone-500">
            {character.kind}
          </span>
        </div>
        {character.role_label && (
          <div className="text-sm text-stone-600">{character.role_label}</div>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Commit.**

```bash
git add src/components/CharacterCard.tsx
git commit -m "components: add CharacterCard"
```

---

## Task 8 — `/characters` list page

**Files:**
- Create: `src/app/characters/page.tsx`

- [ ] **Step 1: Write the page.**

Create `src/app/characters/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import { listCharactersForUser } from "@/lib/characters";
import CharacterCard from "@/components/CharacterCard";

export default async function CharactersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/characters");

  const characters = await listCharactersForUser(user.id);

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-semibold">Your characters</h1>
        <Link
          href="/characters/new"
          className="px-4 py-2 bg-black text-white rounded"
        >
          + Add character
        </Link>
      </div>

      {characters.length === 0 ? (
        <div className="border rounded-lg p-10 text-center bg-stone-50">
          <p className="text-stone-700 mb-1">No characters yet.</p>
          <p className="text-stone-500 text-sm mb-4">
            Add people or pets — they become the stars of your books.
          </p>
          <Link
            href="/characters/new"
            className="inline-block px-4 py-2 bg-black text-white rounded"
          >
            Add your first character
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {characters.map((c) => (
            <CharacterCard key={c.id} character={c} />
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Commit.**

```bash
git add src/app/characters/page.tsx
git commit -m "app: add /characters list page"
```

---

## Task 9 — `/characters/new` + `/characters/[id]` pages

**Files:**
- Create: `src/app/characters/new/page.tsx`
- Create: `src/app/characters/[id]/page.tsx`

- [ ] **Step 1: Create new page.**

Create `src/app/characters/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import CharacterForm from "@/components/CharacterForm";

export default async function NewCharacterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/characters/new");
  return (
    <main className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-6">Add a character</h1>
      <CharacterForm initial={null} />
    </main>
  );
}
```

- [ ] **Step 2: Create edit page.**

Create `src/app/characters/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import { getCharacterForUser } from "@/lib/characters";
import CharacterForm from "@/components/CharacterForm";

type Props = { params: Promise<{ id: string }> };

export default async function EditCharacterPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user) redirect(`/login?next=/characters/${id}`);
  const character = await getCharacterForUser(id, user.id);
  if (!character) notFound();
  return (
    <main className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-6">Edit {character.name}</h1>
      <CharacterForm initial={character} />
    </main>
  );
}
```

- [ ] **Step 3: Type-check.**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Commit.**

```bash
git add src/app/characters/new src/app/characters/[id]
git commit -m "app: add /characters/new and /characters/[id] pages"
```

---

## Task 10 — Wire `/characters` into the Navbar

**Files:**
- Modify: `src/components/Navbar.tsx`

- [ ] **Step 1: Read the navbar.**

Run: `cat src/components/Navbar.tsx | head -100`

Look for the link to `/pets` (or similar pet nav). Add a sibling link to `/characters` with label "Characters". Do NOT remove the "Pets" link yet — Plan D handles deletions. Insert "Characters" before the "Pets" link so it visibly takes priority in dev.

If the Navbar uses a `NAV_LINKS` array or similar, add `{ href: "/characters", label: "Characters" }` before the `pets` entry. If the navbar is hardcoded JSX, add `<Link href="/characters">Characters</Link>` styled the same way as the existing `Pets` link.

- [ ] **Step 2: Build.**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit.**

```bash
git add src/components/Navbar.tsx
git commit -m "navbar: add Characters link (Plan A)"
```

---

## Task 11 — Manual smoke test

**Files:** none. This task is a verification gate before Plan A is considered done.

- [ ] **Step 1: Boot dev.**

Run: `npm run dev` (in background) — terminal will block; user starts it manually or executing-plans starts it via `run_in_background: true`.

Open `http://localhost:3000` in a browser. Sign in (or sign up) as a fresh test user.

- [ ] **Step 2: Navigate to `/characters`.**

Expected: page renders with header "Your characters" + empty state "No characters yet." + "Add your first character" button.

- [ ] **Step 3: Add a person.**

Click "Add character" → pick **Person** → name "Mom" → role "Mom" → traits "Loves baking, hates the cold" → upload 1 photo → Save.

Expected: redirect to `/characters` showing one card labelled "Mom · person".

- [ ] **Step 4: Add a pet.**

Click "Add character" → pick **Pet** → name "Buddy" → role "the goodest boy" → species "dog" → traits "naps in sun spots" → upload 1 photo → Save.

Expected: `/characters` shows both cards.

- [ ] **Step 5: Edit + delete.**

Click the Mom card → change traits → Save → confirm change persists. Then click Delete → confirm dialog → confirm.

Expected: `/characters` shows only the Buddy card.

- [ ] **Step 6: Lint pass.**

Run: `npm run lint`
Expected: zero errors. Warnings about `<img>` usage in `CharacterCard`/`CharacterForm` are acceptable for v1 (using `<img>` instead of `next/image` because the photo URLs are Supabase Storage and `next/image` requires `remotePatterns` config; we can revisit).

- [ ] **Step 7: Final commit if any fixups were needed.**

```bash
git status
# if anything is uncommitted, group it logically and commit
```

---

## Plan A — completion criteria

- `supabase/schema.sql` runs cleanly against a fresh Supabase project. `pets` table no longer exists; `characters`, `character_portraits`, `story_drafts`, `art_styles` exist with RLS.
- `art_styles` has 9 rows (one per curated style) with placeholder sample SVGs served from `/art-style-samples/<id>.svg`.
- `/characters` page works end-to-end (list, add, edit, delete) for both `kind=person` and `kind=pet`.
- `npm run build` and `npm run lint` are clean (modulo pre-existing warnings).

Plan B (generation pipeline) begins after these are verified.
