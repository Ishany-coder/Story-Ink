# Spec A — Pipeline-time AI cast augmentation

**Status:** Draft, awaiting review
**Author:** Claude (with Ishan Ghosh)
**Date:** 2026-05-17
**Targets:** First of two related specs. Spec B (backgrounds + prompt
consistency) follows separately.

## Problem

Pages render in parallel using only a per-page `sceneDescription`
(text) + the user's uploaded cast portraits. Two consequences:

1. **Character drift for non-cast characters.** The current script
   prompt forbids the model from inventing characters
   (`buildScriptPrompt`: "Use only the cast above. Do not invent named
   additional characters."). But a honeymoon book naturally wants
   parents at the wedding; a child's birthday wants siblings; etc.
   Today the user has to remember to add every relevant person
   themselves, with a photo for each.
2. **Cognitive load on the user.** Step 3 of the wizard expects the
   user to enumerate the cast before the script even exists. The user
   doesn't yet know who the story will need.

## Goal

Let the AI invent supporting characters when the story needs them and
generate consistent canonical portraits for those characters, while
keeping the user's uploaded characters as the source of truth where
they exist.

## Non-goals

- **Spec B work** (background consistency, page-art continuity,
  cross-page prompt rework) is out of scope. This spec only addresses
  the cast.
- **Wizard-time AI suggestions.** Not adding a "suggested characters"
  section to the wizard. AI cast members appear in the pipeline, post-
  script, surfaced at the approval gate. The user does not enumerate
  AI cast members in the wizard.
- **AI-to-user conversion.** Uploading a real photo to "convert" an
  AI cast member into a user cast member is deferred to V2.

## User-visible behavior

### Wizard

Unchanged. User picks the characters they have photos for.

### Approval gate (`/stories/[id]/approve-cast`)

Shows ALL cast members in one grid — user-cast (today's behavior) and
AI-cast (new). Each card:

**User-cast card** (today's behavior, unchanged):
- Portrait, name, "Regenerate" button.

**AI-cast card** (new):
- Portrait
- Small "AI-imagined" badge in the top-left corner
- Inline-editable name field (click name to edit, saves on blur)
- **Pencil icon** top-right of the portrait. Click → expands an inline
  panel below the card with:
  - Textarea: "Describe how this character should look (e.g. 'older,
    with grey hair, wearing a blue jacket')"
  - "Regenerate with this" button (primary)
  - "Cancel" link
- "Regenerate" button (re-rolls with the current description, no
  prompt change)
- "Remove" button (with confirmation — triggers Stage 1 re-run, see
  remove-flow below)

### Remove flow

When the user clicks "Remove" on an AI-cast card:
1. Confirmation modal: "Removing [Name] will regenerate the story
   script without them. This takes ~15 seconds and may change other
   pages. Continue?"
2. On confirm: re-run Stage 1 with `excludedAiCharacterNames`
   (described below) added to the script prompt as a hard
   "do-not-include" list. Re-run Stage 1.5 (extract any new AI cast
   members triggered by the rewrite). Regenerate Stage 2 portraits
   for the new AI cast set. Return user to the approval gate with
   updated cast.

### Rename flow

Click the name on an AI-cast card → it becomes an editable input.
Save on blur. Doesn't trigger any regeneration — the name is just a
display label that propagates to the script's `characterIds` mapping
and to subsequent page prompts. No Gemini call.

## Architecture

### Pipeline stages (modified)

```
Stage 1: generateScript                  [MODIFIED prompt]
Stage 1.5: extractAiCastFromScript       [NEW]
Stage 2: generate portraits for ALL cast [MODIFIED — handle AI cast]
[Approval gate]
Stage 3: generate page images            [Unchanged structurally —
                                          page prompt receives both
                                          user-cast + AI-cast portraits
                                          uniformly]
```

### Schema

**New table: `story_ai_cast`**

```sql
create table public.story_ai_cast (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  name text not null,
  role_label text,
  kind text not null check (kind in ('person', 'pet')),
  -- AI-generated appearance description extracted from the script
  description text not null,
  -- User's custom prompt addition from the pencil-icon edit. Null
  -- until the user types something via the pencil.
  user_prompt_addition text,
  portrait_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.story_ai_cast(story_id);

-- RLS: owners of the parent story can read/write their AI cast
alter table public.story_ai_cast enable row level security;
create policy ai_cast_owner_select on public.story_ai_cast
  for select using (
    exists (
      select 1 from public.stories s
      where s.id = story_id and s.user_id = auth.uid()
    )
  );
create policy ai_cast_owner_modify on public.story_ai_cast
  for all using (
    exists (
      select 1 from public.stories s
      where s.id = story_id and s.user_id = auth.uid()
    )
  );
```

**No changes to existing tables.** `character_portraits` (the
cache for user-cast portraits) stays as-is. AI cast portraits are
stored in `story_ai_cast.portrait_url` directly — no caching across
stories because the AI description is per-story.

**Migration file:** `supabase/migrations/003_story_ai_cast.sql`.

### Modified script prompt (`src/lib/story-prompt.ts`)

In `buildScriptPrompt`, replace:

```
- Use only the cast above. Do not invent named additional characters.
```

with:

```
- The cast above is the user-provided roster. If the story
  genuinely needs additional supporting characters (parents at a
  wedding, the priest, the child's best friend, etc.), invent them
  with a clear name and reference them by that name in
  characterIds. Give each invented character a specific, consistent
  description in their first appearance's sceneDescription (age,
  build, hair, distinctive features) so we can generate a
  consistent portrait.
- Output ALL characters that appear on any page in characterIds,
  whether they were in the user-provided cast or invented for the
  story.
- Do not invent characters that don't appear in any scene. Don't
  pad the cast.
```

Plus a new constraint when `excludedAiCharacterNames` is set (re-run
after Remove):

```
- The following character names MUST NOT appear in any page or
  characterIds: [list]. Rewrite scenes that previously included
  them.
```

### New step: extractAiCastFromScript (Stage 1.5)

Pure function. Input: the Stage 1 script + the user's character list.
Output: a list of `AiCastMember`s to insert into `story_ai_cast`.

Discriminator between user-cast and AI-cast in the script output:
the user's characters are keyed by UUID. Invented characters are
named with plain strings (anything not matching the UUID regex
`^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$`). The script prompt
change above instructs the model to use plain names for invented
characters.

The Zod schema for script output (currently in `src/lib/gemini.ts`
inside `generateScript`) needs to be widened: `characterIds` element
type goes from "must be UUID" to "string" with the UUID-vs-name
distinction enforced post-parse in this Stage 1.5 logic, not in the
schema.

Logic:
1. Collect every distinct `characterIds[]` value across all pages.
2. Partition into UUIDs (user-cast) and non-UUIDs (AI-cast names).
3. Verify each UUID resolves to one of the user's cast members
   passed into Stage 1; if not, error the job (script hallucinated
   a UUID).
4. For each AI-cast name, call `inferAiCastDescription` — a small
   Gemini Flash call that takes the name + all `sceneDescription`s
   in which the name appears + the recipient/occasion → returns
   `{role, kind, description}` JSON.
5. Insert each into `story_ai_cast` with the script-supplied name +
   the inferred fields.

### Modified Stage 2 (`generateStoryV2Fn`)

Today: iterates over the user-provided cast, calls
`generateCastPortrait` for each.

New:
1. Same as today for user-cast.
2. After Stage 1.5 inserts AI cast rows, iterate over them and call
   a new `generateAiCastPortrait` for each.

`generateAiCastPortrait(args: { aiCastMember, artStylePromptScaffold,
userPromptAddition? })` — similar to `generateCastPortrait` but:
- No attached reference photo
- Prompt uses the `description` (and `user_prompt_addition` if set)
  as the likeness specification
- Output saved to `story_ai_cast.portrait_url`

Prompt sketch (new function `buildAiCastPortraitPrompt`):

```
Generate a portrait of [name], a [kind]. They are a supporting
character in an illustrated storybook.

Likeness (use these features to render a consistent appearance):
[description from Stage 1.5]

[if user_prompt_addition] Additional adjustments from the user:
[user_prompt_addition]

Render in this illustrated style:
[artStylePromptScaffold]

Framing: head-and-shoulders, centered. Plain neutral background.
Well-lit. No text, captions, or watermarks.

This portrait will be used as the visual anchor for [name] on every
page of the storybook, so the likeness must stay consistent across
pages.
```

### Modified Stage 3 (`generatePagesAfterApprovalFn`)

Today: per page, looks up the script's `characterIds` against the
user-cast list, attaches matching portraits to the page-image call.

New:
1. Build a unified cast map keyed by characterId-or-name with the
   union of user-cast + AI-cast portraits.
2. Per page, resolve each ID/name against the unified map.
3. Attach the resolved portraits to the page-image call as today.

`buildPagePrompt` — no shape change. Just receives more entries in
`characterNamesOnPage` and the corresponding portrait URLs in the
same order.

### API endpoints

Naming convention: API JSON uses camelCase, the Supabase column
`user_prompt_addition` is mapped to `promptAddition` at the route
boundary.

**New: `POST /api/stories/[id]/ai-cast/[aiCastId]/regenerate`**
- Body: `{ promptAddition?: string }`
- Owner-only. Re-renders the portrait via `generateAiCastPortrait`
  with the optional addition. Persists the new URL + the
  `user_prompt_addition` column. Returns the updated row.

**New: `PATCH /api/stories/[id]/ai-cast/[aiCastId]`**
- Body: `{ name?: string }`
- Owner-only. Updates the display name. No regen.

**New: `DELETE /api/stories/[id]/ai-cast/[aiCastId]`**
- Owner-only. Removes the AI-cast row + portrait URL. Triggers a
  background Inngest event `EVENTS.regenerateScriptAfterCastRemoval`
  which re-runs Stage 1 with the removed name added to
  `excludedAiCharacterNames` (passed as event payload — not
  persisted; it's a one-shot input to the re-run), then Stage 1.5
  + Stage 2 for any new characters. UI polls the script-progress
  endpoint and refreshes the approval-gate view when done.

Remove is only available pre-Stage-3. Once the user clicks "Approve
all & generate pages" and Stage 3 starts, the AI-cast set is frozen
for that story. The API enforces this by checking the job's
`status`: returns 409 Conflict if status is not in
`{awaiting_cast_approval}`.

**Modified: `POST /api/stories/[id]/approve-cast`**
- No body change. Approval now waits for both user-cast and AI-cast
  portraits to exist before allowing transition to Stage 3.

### Approval gate UI

Located at `/stories/[id]/approve-cast` (existing route,
`ApproveCastClient.tsx`). Add a separate subsection below the
existing user-cast grid, with header "AI-imagined supporting cast".
When the AI-cast list is empty (story didn't need any additions),
the subsection is hidden entirely.

When the user-cast list is empty but the AI-cast list is non-empty
(rare — user submitted a story with no cast and the AI made one
up), only the AI-cast subsection renders.

State:
- Each AI-cast card has local edit state for the name (when
  click-to-edit is active) and for the pencil-icon textarea.
- Optimistic UI: rename PATCH is fire-and-forget. Regenerate shows
  a spinner on the card. Remove shows a full-screen "Rewriting your
  story…" overlay while the background job runs.

### Error & retry behavior

- **Stage 1.5 fails** → mark job failed with a clear message, allow
  the user to retry. The user-cast portraits already generated are
  preserved.
- **AI-cast portrait gen fails** (Stage 2) → mark just that AI-cast
  row as `portrait_url = null` and surface a "Couldn't render this
  character — try Regenerate" state on its card.
- **Remove + re-run Stage 1 fails** → restore the AI-cast row and
  show an error toast. User's other work is preserved.

## Backward compatibility

- Existing stories: `story_ai_cast` is empty for them. The modified
  Stage 3 lookup falls through to user-cast only. No behavior change
  for in-flight or already-generated stories.
- Existing approval gate: pre-existing stories that already approved
  don't re-trigger the gate. Stage 3 reads from the unified cast
  map; an empty AI-cast list resolves the same as today.

## Observability

- Log every AI-cast member created in Stage 1.5 with story_id +
  name + kind to make funnel analysis possible.
- Sentry breadcrumbs around the Stage 1 re-run on Remove (this is the
  most failure-prone new code path).

## Open questions resolved by user feedback

| Question | Answer |
|---|---|
| Remove behavior | Re-run Stage 1 with character excluded |
| Renaming AI-cast members | Yes — inline-editable name, no regen |
| Upload real photo for AI-cast | Not in V1 |

## Cost analysis

Per-story increase relative to today:
- Stage 1.5: 1× Gemini Flash call per inferred AI-cast member.
  Typical story = 1–3 AI-cast members. Negligible cost.
- Stage 2: 1× image-gen call per AI-cast member. Material cost — this
  is where the spend lives. Roughly +$0.02–0.06 per story.
- Remove: 1× full Stage 1 re-run per remove action. Discretionary
  spend (user opted in).

## Effort estimate

- Schema migration: 15 min
- Stage 1 prompt change: 30 min
- Stage 1.5 (new): 1 hr
- `generateAiCastPortrait` + prompt: 1 hr
- Stage 2 wiring: 1 hr
- Approval gate UI: 3–4 hr (pencil-icon UX, inline rename, remove
  confirm)
- API endpoints: 1.5 hr (regen, patch, delete)
- Remove flow (Inngest event + Stage 1 re-run): 2 hr
- Tests + manual verification: 1–2 hr

**Total: ~1.5–2 days of focused work.**

## Out of scope (deferred)

- Background consistency (Spec B)
- Page-art continuity (Spec B)
- User uploading a photo to convert an AI-cast member (V2)
- Bulk operations on the approval gate (regen-all, remove-all)
- Multi-version history of an AI-cast member's portrait
