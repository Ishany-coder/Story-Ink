# Spec B — Backgrounds + cross-page setting consistency

**Status:** Draft, awaiting review
**Author:** Claude (with Ishan Ghosh)
**Date:** 2026-05-17
**Prereq:** Spec A (AI cast augmentation) — merged in PR #65. This
spec extends the same approval-gate pattern with a third subsection.

## Problem

Pages render in parallel using a per-page `sceneDescription` plus
the canonical cast portraits attached as visual anchors. Cast looks
consistent across pages because the canonical portrait pins each
character's likeness. There is no equivalent mechanism for settings.

Concrete failure mode: a 24-page story with three locations (home,
the park, the wedding venue) gets rendered as 24 independent
re-imaginings of those places. The park on page 3 is a tidy lawn
with a fountain; the park on page 7 is a hilly meadow with a
playground. The home kitchen has white cabinets in one scene and
oak cabinets in another. The wedding venue's altar moves around.

The drift is real and visible. The script knows the setting (it
wrote it), but the per-page image call has no shared visual anchor
for "the park" beyond the new text description on each call.

## Goal

Generate one canonical illustration per distinct location and
attach it as a visual reference on every page set there — the same
consistency mechanism cast portraits already provide, applied to
settings.

## Non-goals

- **Time-of-day / lighting / mood variations** within a single
  location do not get their own backgrounds. The canonical
  illustration establishes geography, landmarks, palette, and
  general feel. Per-page text prompts handle "the park at sunset"
  vs "the park at dawn" by referencing the same canonical art with
  different lighting language.
- **User-uploaded reference photos of settings.** A user's actual
  backyard photo is currently a "memory reference" attached
  per-page. Spec B does not promote memories to backgrounds. V2
  could; not in scope here.
- **Cross-story background caching.** Two stories that both
  feature "the park" still generate their own backgrounds — the
  AI descriptions differ per story, and caching adds complexity
  for negligible perf win. Match Spec A: per-story rows.
- **User-driven merge / split** of backgrounds at the approval
  gate. The model's grouping is taken as ground truth for V1.

## User-visible behavior

### Wizard

Unchanged.

### Approval gate

The existing `/stories/[id]/approve-cast` page (rendered by
`ApproveCastClient`) is extended. The component is renamed to
`ApproveStoryClient` to reflect that it now covers more than the
cast. Three sections:

1. **Your cast** — user-cast portraits (unchanged).
2. **AI-imagined supporting cast** — AI-cast (Spec A, unchanged).
3. **Settings** (new) — one card per background:
   - 16:9 wide-aspect thumbnail (vs square for cast)
   - Inline-editable label (click → input → save on blur, no
     regen)
   - Pencil icon → expands inline textarea ("Describe how this
     setting should look — e.g. 'darker, with more trees'") +
     "Regenerate with this" button. Mirrors Spec A's AI-cast UX
     including PR #66's fix (Regenerate also opens the box first;
     it doesn't fire immediately).
   - Plain "Regenerate" button — opens the same prompt box.
   - "Remove" button — confirmation modal → DELETE → Stage 1
     re-run with the removed label in `excludedBackgroundLabels`.
     Full-page overlay ("Rewriting your story…") while the new
     script + backgrounds spin up.

The "Approve all & generate pages" button at the bottom now
commits cast (user + AI) + backgrounds together. Disabled while
any regenerate or rerun is in flight.

### Stage 3 (page art)

Each page's image call now attaches:
1. The page's background portrait (FIRST in the image-parts array)
2. The cast portraits for characters on the page (Spec A unified
   map — user-cast or AI-cast)
3. The memory reference photos for the page (existing)

The text prompt explicitly enumerates each batch in order.

## Architecture

### Pipeline stages (modified from Spec A)

```
Stage 1: generateScript                  [MODIFIED prompt + JSON shape]
Stage 1.5: extractAiCastFromScript       [Spec A, unchanged]
Stage 1.6: extractBackgroundsFromScript  [NEW]
Stage 2: user-cast portraits             [Spec A, unchanged]
Stage 2.5: AI-cast portraits             [Spec A, unchanged]
Stage 2.6: background portraits          [NEW]
[Approval gate — now with Settings subsection]
Stage 3: generate page images            [MODIFIED to attach bg portrait]
```

### Modified script prompt (`src/lib/story-prompt.ts`)

`buildScriptPrompt` is extended in two ways:

**New per-page field:** `setting` (string). Required. Must match
exactly one entry in the top-level `backgrounds` array. If the
page is genuinely setting-less (e.g. a dedication page, an
abstract intro), the script may emit an empty string — Stage 3
falls through to "no background ref" behavior.

**New top-level array:** `backgrounds`. Each entry:
- `label` (string): short location name, 1–4 words. Will be the
  display label in the approval gate.
- `description` (string): paragraph describing the location's
  stable physical features — geography, landmarks, structures,
  palette, time of year / general mood. Stable means features
  that hold across every page set there; do NOT describe scene-
  specific things like "Buddy on the bench" or "morning light"
  here.

**Prompt constraints added:**
- Every page's `setting` must match a `backgrounds[].label`.
- 2–5 distinct backgrounds is the typical target. Don't pad with
  one-off locations that only appear in a single page if they
  share geography with an existing location.
- Don't invent a new background for the same location seen at
  different times — that's a per-page lighting variation, not a
  new background.

**`excludedBackgroundLabels` constraint** (mirrors Spec A's
`excludedAiCharacterNames`) appended when re-running after the
user removes a background at the approval gate.

### New: Stage 1.6 — extractBackgroundsFromScript

Pure validate-and-insert. Input: the Stage 1 script + the story
context. Output: a list of `Background`s persisted to
`story_backgrounds`.

Logic:
1. Read the script's top-level `backgrounds[]` array.
2. Verify every page's `setting` (when non-empty) matches a
   `backgrounds[].label`. If not, raise a parse error — the Stage
   1 retry plumbing surfaces it as a script-gen failure and
   regenerates.
3. Insert each entry into `story_backgrounds` (`label`,
   `description`).

No Gemini call here — the model already grouped + described in
Stage 1. Stage 1.6 is just validation + persistence.

On re-run (after removal): drop existing `story_backgrounds` for
the story, re-validate, re-insert.

### New: Stage 2.6 — background portraits

Iterate over `story_backgrounds` rows; call
`generateBackgroundPortrait` for each row whose `portrait_url` is
null. On a removal-flow re-run Stage 1.6 has already dropped all
existing rows and re-inserted from the new script, so every row
has a null `portrait_url` and gets generated fresh. The
null-check is for the initial-generation case (where some rows
may have been persisted by an earlier successful run and a
retry/resume should skip them).

`generateBackgroundPortrait(args: { label, description,
userPromptAddition?, artStylePromptScaffold })` — image-gen call,
no input image (like AI-cast portraits). Returns base64 data URI;
caller uploads + persists `portrait_url`.

Prompt sketch (`buildBackgroundPortraitPrompt`):

```
Generate a wide-angle establishing illustration of: [label].

Setting features (use these to render a consistent appearance):
[description]

[if userPromptAddition] Additional adjustments from the user:
[userPromptAddition]

Render in this illustrated style:
[artStylePromptScaffold]

Wide-angle, no characters, no text in the image. This
illustration will be the canonical visual reference for [label]
on every page set in this location.
```

### Modified Stage 3 (`generatePagesAfterApprovalFn`)

The page-context loader pulls `story_backgrounds` alongside
existing data:

```ts
const { data: backgrounds } = await admin
  .from("story_backgrounds")
  .select("label, portrait_url")
  .eq("story_id", storyId)
  .not("portrait_url", "is", null);
const bgByLabel = new Map(
  backgrounds.map((b) => [b.label, b.portrait_url])
);
```

Per page:
1. Resolve the page's `setting` against `bgByLabel`. The
   resolved entry (if any) becomes `backgroundPortrait`.
2. Build cast + memory refs as today.
3. Call `generatePageImageWithCastRefs` (renamed —
   `generatePageImage` — and given an optional
   `backgroundPortrait` argument).

The image-call image-parts array order: `[text, background?,
...castInline, ...memoryInline]`. The text prompt enumerates the
background first so the model knows which attached image is which.

### Modified page prompt (`buildPagePrompt`)

Extend the function signature with `backgroundPortrait?: { label }`
and inject a new block (before the cast portraits block):

```
Background reference attached: "[label]". Use the geography,
landmarks, palette, and overall look from this image as the
canonical appearance of [label]. Adapt only the camera angle, time
of day, and mood per the scene description — do not re-imagine the
location itself.
```

This sits in the prompt between the scene description and the
cast portraits block, so the model reads "this is where we are"
before "here's who's in it."

### Schema

`supabase/migrations/004_story_backgrounds.sql`:

```sql
create table if not exists public.story_backgrounds (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  label text not null,
  description text not null,
  user_prompt_addition text,
  portrait_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists story_backgrounds_story_idx
  on public.story_backgrounds (story_id);

-- Same RLS shape as story_ai_cast (Spec A): owner of the parent
-- story can read + modify their backgrounds.
alter table public.story_backgrounds enable row level security;

drop policy if exists "story backgrounds readable by owner"
  on public.story_backgrounds;
create policy "story backgrounds readable by owner"
  on public.story_backgrounds for select
  using (exists (
    select 1 from public.stories s
    where s.id = story_backgrounds.story_id
      and s.user_id = auth.uid()
  ));

drop policy if exists "story backgrounds modifiable by owner"
  on public.story_backgrounds;
create policy "story backgrounds modifiable by owner"
  on public.story_backgrounds for all
  using (exists (
    select 1 from public.stories s
    where s.id = story_backgrounds.story_id
      and s.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.stories s
    where s.id = story_backgrounds.story_id
      and s.user_id = auth.uid()
  ));

-- updated_at trigger (same pattern as story_ai_cast).
```

### Type additions (`src/lib/types.ts`)

```ts
export interface Background {
  id: string;
  story_id: string;
  label: string;
  description: string;
  user_prompt_addition: string | null;
  portrait_url: string | null;
  created_at: string;
  updated_at: string;
}
```

Also widen `Script`/`ScriptPage` to include the new fields. Two
shape changes:

`ScriptPage` gains `setting?: string` (optional — empty / missing
means "no background").

`Script` gains `backgrounds: Array<{ label: string; description: string }>` at the top level.

Both go in `src/lib/script-schema.ts` Zod schema.

### API endpoints

Three new routes, mirroring Spec A's AI-cast routes:

**`POST /api/stories/[id]/backgrounds/[bgId]/regenerate`**
- Body: `{ promptAddition?: string }`
- Owner-only. Sends `EVENTS.backgroundRegenerate`. Returns `{ jobId }`.

**`PATCH /api/stories/[id]/backgrounds/[bgId]`**
- Body: `{ label?: string }`
- Owner-only. Sync rename. No regen. Note: renaming a background
  also requires updating every page's `setting` in the script to
  match the new label. Done atomically: PATCH updates the
  `story_backgrounds.label` AND patches the script JSON in
  `stories.script` to replace the old label with the new one on
  every page that referenced it.

**`DELETE /api/stories/[id]/backgrounds/[bgId]`**
- Owner-only. Sends `EVENTS.backgroundRemoved`. Returns `{ jobId }`.
- Blocked once Stage 3 has started for this story (409 Conflict).

### Inngest events + functions

Two new events:
- `EVENTS.backgroundRegenerate`
- `EVENTS.backgroundRemoved`

Two new functions (in `src/inngest/functions.ts`):

**`regenerateBackgroundFn`** — triggered by `backgroundRegenerate`.
Same shape as `regenerateAiCastPortraitFn`: persist
`promptAddition` (when supplied), regenerate the portrait, update
`story_backgrounds.portrait_url`, `markDone(jobId, { stage:
"background_regenerated", bgId, portraitUrl })`.

**`regenerateScriptAfterBackgroundRemovalFn`** — triggered by
`backgroundRemoved`. Mirrors
`regenerateScriptAfterAiCastRemovalFn` from Spec A. Clears
`story_backgrounds`, re-runs Stage 1 with
`excludedBackgroundLabels: [removedLabel]`, then 1.5 + 1.6 + 2 +
2.5 + 2.6 reconcile (cast portraits already in
`character_portraits` are reused — they're keyed by character_id,
not by script).

Add both to `allFunctions`.

### Cost analysis

Per-story incremental cost (on top of Spec A):
- Stage 1.6: zero Gemini calls (pure validation).
- Stage 2.6: 1× image-gen call per distinct background. Typical
  story = 2–5 backgrounds → +$0.04–$0.12.
- Remove: 1× full Stage 1 re-run + 2.6 regen for the new bg set.
  User-opted-in spend.

### Backward compatibility

- Existing stories: no `story_backgrounds` rows. Stage 3 reads an
  empty `bgByLabel` map → no `backgroundPortrait` passed → page
  prompt falls back to today's behavior (no background ref).
  Script shape change (`backgrounds[]` top-level, `setting`
  per-page) does NOT affect pre-existing scripts because their
  Zod parse used the old schema and persisted JSON as-is. New
  script generations from the moment this ships forward will
  carry the new fields.
- Approval gate: the new "Settings" section renders empty for
  pre-existing stories (or stories where the script has no
  backgrounds), and `ApproveStoryClient` hides the section header
  when empty.

### Observability

- Log every background extracted in Stage 1.6 with story_id +
  label so backfilling / debugging is straightforward.
- Sentry breadcrumb around the Stage 1 re-run on Remove (highest-
  risk new code path — mirrors Spec A's approach).

## Effort estimate

- Schema migration: 15 min
- Type + Zod schema additions: 30 min
- Stage 1 prompt update: 30 min
- Stage 1.6 (new): 45 min
- `generateBackgroundPortrait` + prompt: 1 hr
- Stage 2.6 wiring: 1 hr
- Stage 3 modification: 1.5 hr (page prompt + image-call wiring)
- API endpoints (3): 1.5 hr
- Inngest functions (2): 2 hr
- Approval gate UI (renamed component + Settings section): 3 hr
- Tests + manual verification: 1.5 hr

**Total: ~1.5–2 days of focused work, same shape as Spec A.**

## Open questions resolved

| Question | Answer |
|---|---|
| Same approval gate or separate? | Same gate, new Settings subsection |
| Remove behavior | Re-run Stage 1 with label excluded |
| Granularity (location vs scene) | Location-level |
| Cache across stories | No — per-story |
| User-driven merge/split | Not in V1 |

## Out of scope (deferred to V3 or later)

- Promoting user memory uploads to backgrounds
- Cross-story background caching
- Multi-background pages (page that genuinely spans two settings)
- User-driven merge of two backgrounds the model created separately
