# Creation Flow Overhaul — Design Spec

> **Note:** This file is the plan-mode artifact. On approval, an identical copy
> is written to `docs/superpowers/specs/2026-05-15-creation-flow-overhaul-design.md`
> in the project repo (per the brainstorming skill) and committed.

**Date:** 2026-05-15
**Status:** awaiting spec review
**Driver:** Sanjoy Ghosh

---

## Context

Today Story-Ink is pet-first. The home page funnels users into "pick a pet" or "skip pet" → a single inline `HomeCreate` form → generation. Anyone wanting a book about a person (sibling, parent, friend) has no clean path; the `pets` schema and prompt scaffolding are tightly coupled to "pets", and people cannot be uploaded as subjects at all.

The generation pipeline also has a serial-image dependency chain (`quality` mode generates page N using page 1 + page N-1 as inline image context) that is fragile, slow, and only consistent because it cascades from a single canonical page-1 image — there is no character-level reference.

This overhaul replaces the creation flow end-to-end with a guided multi-step wizard that supports **any subject** (people, pets, or mixed casts), backed by a **3-stage pipeline** built around per-character canonical "cast portraits" used as reference images for every page. The app is pre-production, so no V1 paths are preserved — existing rows are wiped and V1 code is deleted in the same change.

---

## Goals & scope

**In scope**
- New `characters` table (replaces `pets`), unifying people + pets with reusable reference photos.
- New 7-step creation wizard (replaces `HomeCreate` and `/create`).
- New Inngest pipeline: `generateStoryV2Fn` (script + cast portraits) → user approval gate → `generatePagesAfterApprovalFn`.
- Cast portrait caching by `(character_id, art_style_id)`.
- Curated art-style catalog (~10–14 styles) with static pre-generated sample images committed to the repo.
- DB-persisted wizard drafts (`story_drafts`); multiple parallel drafts per user.
- Hard wipe of V1 code paths and V1 data (`pets`, old `stories`, `jobs`, `print_orders`, `custom_layouts`).

**Out of scope (deliberately, for v1)**
- Custom art-style upload (user-provided reference image → style prompt).
- Personalized cast previews on the style-picker step (rendering the user's actual cast in each style as the grid thumbnails).
- Changes to the Studio editor / `CanvasEditor.tsx` overlay system (pipeline-agnostic; operates on rendered pages).
- Changes to print fulfillment, Stripe checkout, `pdf-lib` PDF building, or `print_orders` lifecycle.

---

## Data model

Schema lives in `supabase/schema.sql` and is idempotent (re-run after edits).

### `characters` (replaces `pets`)

```
id                      uuid PK
user_id                 uuid → auth.users   (RLS: auth.uid() = user_id)
kind                    text CHECK in ('person','pet')
name                    text NOT NULL                -- "Maya", "Buddy"
role_label              text                         -- optional, e.g. "Mom", "the hero"
traits                  text                         -- freeform; supersedes pet "quirks"
species                 text                         -- only for kind=pet (nullable)
reference_photo_urls    text[] NOT NULL DEFAULT '{}' -- 1–5 photos in 'uploads' bucket
created_at, updated_at  timestamptz
```

- Memorial flag intentionally dropped — memorial is per-book in `stories.occasion`.
- Reference photos uploaded via service role to the existing `uploads` bucket; paths recorded here.

### `character_portraits` (new — cache)

```
id              uuid PK
character_id    uuid → characters (cascade)
art_style_id    text → art_styles.id
portrait_url    text NOT NULL
generated_at    timestamptz
UNIQUE (character_id, art_style_id)
```

- Read first in Stage 2; only renders + inserts on miss.
- RLS scoped via `character_id → characters.user_id`.

### `story_drafts` (new — wizard auto-save)

```
id              uuid PK
user_id         uuid → auth.users
title           text                -- auto-derived ("Birthday book for Mom — draft")
current_step    smallint CHECK 1..7
payload         jsonb               -- partial WizardState
updated_at      timestamptz
```

- Many parallel drafts per user.
- Auto-saved on every step transition and after each photo upload completes.
- Promoted to a `stories` row on Step 7 "Generate", then deleted.

### `stories` (existing — additive + one removal)

- **Add:** `recipient_type` (text), `occasion` (text), `art_style_id` (text → art_styles), `script` (jsonb), `cast_character_ids` (uuid[]), `story_tone` (text — `classic` | `rhyming`).
- **Remove:** `petId` and any pet-specific columns (after data wipe — no migration needed).
- Keep: `pages` (jsonb), `is_public`, `ai_system_prompt`, etc.
- `script` jsonb shape: `{ title, dedication, pages:[{ pageNumber, text, sceneDescription, characterIds[] }] }`.

### `art_styles` (new — curated catalog)

```
id                 text PK            -- "whimsy_watercolor"
display_name       text               -- "Whimsy Watercolor"
description        text
prompt_scaffold    text               -- internal style prompt fragment
sample_image_urls  text[]             -- pre-rendered samples (public Storage URLs)
sort_order         int
is_active          boolean DEFAULT true
```

- Read-only to users; managed by SQL/seed.
- Seeded by `supabase/seed-art-styles.sql`. Sample images live in `public/art-style-samples/<style_id>.{webp,jpg}` and are committed to the repo.

### `pets` — dropped permanently in the same migration. No shim.

### RPC

- Keep `update_story_page_fields(story_id, page_number, patch)` — still the only correct way to mutate a single page in `stories.pages`. Used by Studio + AI assistant + Stage 3 page generation.

---

## Wizard UX

**Route:** single new component at `/create/new` (replaces `/create` and the inline `HomeCreate` on `/`). Step state lives in URL search params (`?step=N&draft=<id>`) so browser back and direct links work. Resume from home uses `?draft=<id>`.

**Step 1 · Who is this book for?**
8 recipient tiles: Partner, Child, Parent, Sibling, Friend, Self, Pet, Other. Writes `recipient_type` to draft.

**Step 2 · Occasion & tone**
Occasion tiles, filtered by recipient: Birthday, Anniversary, Memorial, Just Because, Graduation, Holiday, New Baby, Other. Memorial enables the memorial prompt guardrails in `src/lib/story-prompt.ts` (generalized from today's `buildPetStorySystemPrompt`).

**Step 3 · Build the cast**
Lists existing `characters` as selectable cards + "Add new". Inline character editor: name, role label, kind toggle (person/pet), 1–5 reference photo uploads (via service role to `uploads` bucket), traits textarea. Min 1 character. Drag-to-reorder sets the lead character. Coming from `/characters/new`, deep links back to Step 3 with the new character pre-added.

**Step 4 · Story outline / key memories**
Freeform prompt textarea. "Key memories" chip input (small structured tags merged into the script prompt as bullet beats). Optional story-starter templates per `(recipient, occasion)`. For Memorial + Pet, preserves today's "Recollection" vs "Rainbow Bridge" choice as a starter.

**Step 5 · Art style**
Grid of curated styles reading from `art_styles`. Each card shows one sample image + display name. "Story style" segmented control above the grid: **Classic | Rhyming**. Saves `art_style_id` and `story_tone` to draft.

**Step 6 · Length & format**
Page-count presets: 8 / 16 / 24 / 32 / 48. Free-form numeric input behind "More options" with a hard cap of **64**. Print-eligibility hint: ≥ 24 = print-ready, < 24 = digital-only.

**Step 7 · Review & generate**
Summary card. "Generate" promotes the draft into a `stories` row, deletes the draft, inserts a `jobs` row, sends `inngest.send({ name: EVENTS.STORY_GENERATE_V2, data: { storyId, jobId } })`. Redirects to `/stories/[id]/progress`.

### Cast approval gate

Dedicated route `/stories/[id]/approve-cast`, rendered when `jobs.status === 'awaiting_cast_approval'`. Shows each character's canonical portrait + per-character "Regenerate" + an "Approve all" CTA. "Approve all" calls `POST /api/stories/[id]/approve-cast`, which sends `EVENTS.CAST_APPROVED` and flips `jobs.status` to `running`. Per-character regenerate posts to `POST /api/stories/[id]/cast/[characterId]/regenerate`.

### Auto-save

Every step transition does `PATCH /api/drafts/[id]` with the current `payload`. Photo uploads are independent — uploads complete first to Storage, the draft only stores resulting URLs. Home page shows a "Resume" list of drafts above the library; each card links to `/create/new?draft=<id>`.

### Standalone character library

New `/characters` route renders the user's character library outside the wizard (CRUD on `characters` rows). Replaces `/pets` and `/pets/new`.

---

## Generation pipeline

Events live in `src/inngest/client.ts` as the `EVENTS` const:

```
STORY_GENERATE_V2 = "story.generate.v2"
CAST_APPROVED     = "story.cast.approved"
```

### `generateStoryV2Fn` (orchestrator, in `src/inngest/functions.ts`)

Triggered by `STORY_GENERATE_V2`. Each step retries independently.

1. `step.run("generate-script")` — calls `generateScript(story)` in `src/lib/gemini.ts`:
   - Single Gemini text call with a JSON-schema-constrained output.
   - Inputs: cast (names + role labels + traits + kinds), occasion, art-style display name (tone hint), outline, key memories, page count, recipient type, story tone.
   - Output: `{ title, dedication, pages:[{ pageNumber, text, sceneDescription, characterIds[] }] }`.
   - Persisted to `stories.script`; surfaced on the progress page.

2. `step.run("generate-cast-portraits")` — for each unique character in the script, in parallel via `Promise.all` inside the step:
   - Check `character_portraits` for `(character_id, art_style_id)`. Cache hit → skip.
   - Miss: Gemini image call. Inputs: reference photos (URLs gated through `isAllowedContentUrl` from `src/lib/http.ts`), `art_styles.prompt_scaffold`, traits, role label.
   - Upload to `uploads`; insert into `character_portraits`.

3. Update `jobs.status = 'awaiting_cast_approval'`, snapshot the portrait URLs onto the `jobs.result` payload, and **return**. The function does not wait for human input inside Inngest.

### `generatePagesAfterApprovalFn`

Triggered by `CAST_APPROVED`.

1. For each page in `stories.script`, fan out `step.run("generate-page-N")`:
   - Inputs: `sceneDescription`, `art_styles.prompt_scaffold`, **canonical portraits of only the characters on this page** (looked up from `character_portraits`).
   - No page-to-page conditioning. Stable refs replace the cross-page chain.
   - Output written via `update_story_page_fields(story_id, page_number, patch)` — RPC is the only safe way to update a single page in the JSONB array.

2. On terminal success, mark `jobs.status = 'done'`. `onFailure` marks `failed` and leaves any already-rendered pages so the user can retry individual pages from the Studio.

### Per-character regenerate

`POST /api/stories/[id]/cast/[characterId]/regenerate` re-runs Stage 2 for one character: regenerates the portrait, replaces the row in `character_portraits`, and updates the job's snapshot. Same SSRF gating.

### Cost / observability

Each `step.run` writes Gemini token usage onto `jobs.result`. Stage 2 cache hit rate is computable per job from the result payload.

### Auth + SSRF

- Inngest functions always use `supabaseAdmin()` (no session — same as today).
- All HTTP entry points authenticate via `requireUser()` + `assertOwnsStory()` from `src/lib/supabase-server.ts`.
- Every outbound fetch on a user-influenceable URL gates through `isAllowedContentUrl` (`src/lib/http.ts`). New call sites: cast portrait generation in Stage 2, page generation in Stage 3 (refs come from `character_portraits.portrait_url`, which the app itself wrote — still gated for defense in depth).

---

## Art-style system

**Curated only for v1.** No custom upload, no personalized previews.

- Catalog stored in `art_styles` (~10–14 rows). Each row has a `prompt_scaffold` that is appended to every Gemini prompt for both cast portraits and pages in that style.
- Sample imagery committed to `public/art-style-samples/<style_id>.{webp,jpg}` — one image per style is sufficient for v1; the seed can list multiple URLs once we have them.
- Initial style list (subject to refinement during implementation): Whimsy Watercolor, Whiteboard Crayon, Sketch Magic, Superhero Comic, Cartoon Adventure, Color Paper Cutouts, Folk Tale Storybook, Studio Ghibli, Soft Romantic. Final list lives in the seed file.
- `story_tone` (Classic | Rhyming) is a sibling field on the wizard's Step 5 and is applied to the script generator only — it does not affect art.

---

## Cutover

Pre-production, so no migration; this is a hard replacement.

### Schema

- `supabase/schema.sql` is rewritten to:
  - `DROP TABLE pets, stories, jobs, custom_layouts, print_orders` (cascade where needed).
  - Recreate `stories`, `jobs`, `custom_layouts`, `print_orders` with the new `stories` columns.
  - Create `characters`, `character_portraits`, `story_drafts`, `art_styles`.
  - Reapply RLS policies for the new tables.
  - Reapply `update_story_page_fields` RPC (unchanged).
- `supabase/seed-art-styles.sql` inserts the curated style rows.

### Code deletions

- `src/inngest/functions.ts`: remove `generateStoryFn` (V1) and any helpers it owned.
- `src/inngest/client.ts`: remove `EVENTS.STORY_GENERATE` (old name).
- `src/lib/gemini.ts`: remove the `imageMode: "quality" | "fast"` branching; remove `generatePageImage`'s page-to-page conditioning; replace with `generateCastPortrait` + `generatePageImageWithCastRefs`.
- `src/lib/pet-prompt.ts`: delete. Replace with `src/lib/story-prompt.ts` that builds prompts from `(recipient_type, occasion, story_tone, characters[])`. Memorial guardrails live here, gated by `occasion === 'memorial'`.
- `src/components/HomeCreate.tsx`: delete.
- `src/components/PetPicker.tsx`, `src/components/PetForm.tsx`: delete.
- `src/app/create/page.tsx`, `src/app/pets/page.tsx`, `src/app/pets/new/page.tsx`: delete (replaced by `/create/new` and `/characters`).
- `src/app/api/generate/route.ts`: rewrite to validate the new wizard payload and dispatch `STORY_GENERATE_V2`. The route path may remain stable.
- `src/components/HeroSection.tsx`: simplify — strip the inline create-form coupling; CTA links to `/create/new`.
- `src/app/page.tsx`: rewrite the empty-state and dashboard sections. Empty state CTA → `/create/new`. Drafts "Resume" list above the library.

### Code kept

- `CanvasEditor.tsx` + `src/lib/layouts.ts` + custom layouts (Studio operates on rendered pages — pipeline-agnostic).
- `/api/stories/[id]/ai/*` routes (edit already-rendered pages).
- `/api/ship/*` + `pdf-lib` + `print_orders` (print pipeline untouched).
- `update_story_page_fields` RPC, two-supabase-client architecture, `assertOwnsStory`, `src/proxy.ts` cookie refresh, `/api/health`.

---

## Verification plan

Run end-to-end against a fresh Supabase project (or `supabase db reset`):

1. `npm run build` and `npm run lint` clean.
2. **Fresh signup → person book.** Sign up as a new user. Land on `/`. Confirm "Resume" list is empty and library is empty. Start `/create/new`. Walk all 7 steps with one **person** character (verifying photo upload of a non-pet works). Reach `/stories/[id]/approve-cast`. Approve. Verify pages render with consistent character appearance across the entire book.
3. **Mixed cast.** Repeat with one person + one pet. Confirm both render in the same chosen art style and stay visually consistent across pages.
4. **Draft persistence.** Mid-wizard on Step 4, hard-refresh the tab. Confirm draft auto-resumes to Step 4 with all prior input intact.
5. **Parallel drafts.** Open a second wizard tab while the first is on Step 5. Confirm both drafts appear in the home "Resume" list with distinct titles.
6. **Memorial occasion.** Run a Memorial-occasion wizard for a deceased pet. Confirm the generated script honors the memorial guardrails (no peril; either recollection or Rainbow Bridge — never blended).
7. **Cache hit.** Generate book #2 reusing one character from book #1 in the same art style. Confirm Stage 2 reports a cache hit for that character on `jobs.result` (no new image call for that character).
8. **Cast regenerate.** On the cast-approval page, click Regenerate on one character. Confirm only that character re-renders; the rest are untouched.

### Files most likely to change (non-exhaustive)

- `supabase/schema.sql`, `supabase/seed-art-styles.sql`
- `src/inngest/client.ts`, `src/inngest/functions.ts`
- `src/lib/gemini.ts`, `src/lib/story-prompt.ts` (new), `src/lib/supabase.ts`, `src/lib/http.ts`
- `src/app/create/new/page.tsx` (new), `src/app/characters/page.tsx` (new), `src/app/stories/[id]/approve-cast/page.tsx` (new), `src/app/stories/[id]/progress/page.tsx`
- `src/app/api/drafts/route.ts` (new), `src/app/api/drafts/[id]/route.ts` (new), `src/app/api/stories/[id]/approve-cast/route.ts` (new), `src/app/api/stories/[id]/cast/[characterId]/regenerate/route.ts` (new), `src/app/api/generate/route.ts` (rewrite)
- `src/app/page.tsx`, `src/components/HeroSection.tsx`
- `public/art-style-samples/*.webp` (new assets)

---

## Follow-ups (not in this spec)

- Custom art-style upload (user-provided reference image → style prompt).
- Personalized cast previews in the style picker (render user's cast in each style).
- Studio AI assistant updates to leverage character refs (today's assistant edits already-rendered pages; a future pass can let it re-render using cast portraits for consistency).
- Cleanup of any unused fields on `stories` once V2 is stable.
