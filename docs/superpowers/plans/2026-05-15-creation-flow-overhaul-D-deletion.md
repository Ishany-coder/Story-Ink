# Plan D — V1 Deletion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Delete every pet-only / V1-only code path now that the V2 wizard + pipeline are landed and working. App is pre-production — no shim, no deprecation period.

**Architecture:** This is a cleanup plan. Each task removes one cohesive slice (V1 inngest, V1 routes, V1 components, pet types). After every task, `npm run build && npm run lint` must pass and a manual click-through of the V2 flow must still succeed.

**Tech Stack:** Same as A/B/C.

**Spec:** `docs/superpowers/specs/2026-05-15-creation-flow-overhaul-design.md`
**Depends on:** Plans A + B + C are landed and verified end-to-end.

---

## What we keep (do NOT delete)

- AI Assistant routes + functions (`assistText`, `assistImage`, `assistInfer`, `regenText`) — these mutate already-rendered pages and are pipeline-agnostic.
- `CanvasEditor`, `SlideReader`, `BookCard`, all studio/* components.
- Print pipeline (`/api/ship/*`, `print-pdf.ts`, `print_orders` table).
- Support chat, account, admin routes.
- `update_story_page_fields` RPC + the two-supabase-client architecture.

---

## Task 1 — Delete V1 Inngest entrypoint + related events

**Files:**
- Modify: `src/inngest/functions.ts`
- Modify: `src/inngest/client.ts`

- [ ] **Step 1: Find the V1 generator function.**

Run: `grep -n "EVENTS.generateStory\|story/generate.requested\|generateStoryFn" src/inngest/functions.ts`

Identify the V1 function block — the one that handles `EVENTS.generateStory` (the V1 event, not V2). It is large (uses `imageMode`, calls V1 `generatePageImage`, uses `buildPetDescription` / `composePetStoryPrompt`).

- [ ] **Step 2: Delete the V1 generator.** Remove the entire `inngest.createFunction(...)` block for V1 story generation. Also remove its declaration from `allFunctions` at the bottom of the file.

- [ ] **Step 3: Remove V1 imports that are now unused.** After deletion, search for now-orphaned imports:

```ts
import {
  buildPetDescription,
  composePetStoryPrompt,
} from "@/lib/pet-prompt";
import { generatePageImage, generateStoryText } from "@/lib/gemini";
```

If any of these symbols are still used by *kept* functions (e.g. `regenText` may use `generateStoryText`), leave the import line. Otherwise remove it cleanly. Run `npm run build` to surface any still-needed imports — TS will error.

- [ ] **Step 4: Remove the V1 event from `EVENTS`.**

In `src/inngest/client.ts`, change:

```ts
export const EVENTS = {
  generateStory: "story/generate.requested",
  regenText: "story/regen-text.requested",
  // ...
} as const;
```

to delete the `generateStory` line:

```ts
export const EVENTS = {
  regenText: "story/regen-text.requested",
  assistText: "assist/text.requested",
  assistImage: "assist/image.requested",
  assistInfer: "assist/infer.requested",
  storyGenerateV2: "story/generate.v2.requested",
  castApproved: "story/cast.approved",
  characterRegenerate: "character/portrait.regenerate.requested",
} as const;
```

- [ ] **Step 5: Build + commit.**

```bash
npm run build
git add src/inngest/functions.ts src/inngest/client.ts
git commit -m "inngest: delete V1 story generator + event"
```

---

## Task 2 — Delete V1 `/api/generate` route + V1 image-mode logic

**Files:**
- Delete: `src/app/api/generate/route.ts`
- Modify: `src/lib/gemini.ts`
- Possibly delete: `src/lib/image-styles.ts`, `src/lib/story-page-count.ts`

- [ ] **Step 1: Delete the V1 route.**

```bash
git rm src/app/api/generate/route.ts
```

The V2 entry point lives at `src/app/api/generate/v2/route.ts` (Plan B). The bare `/api/generate` is gone.

- [ ] **Step 2: Delete V1 Gemini wrappers.**

In `src/lib/gemini.ts`, delete:
- `generatePageImage` and any `quality`/`fast` `imageMode` branching helpers (the V2 pipeline uses `generatePageImageWithCastRefs`).
- `generateStoryText` IF it is no longer referenced anywhere. Check: `grep -rn "generateStoryText" src/`. If only `regenText`-style functions still use it, KEEP it.

- [ ] **Step 3: Decide `image-styles.ts` fate.**

`grep -rn "image-styles\|imageStyle" src/`. If the only remaining references are inside V1 deletion candidates from this plan, delete the file. If the AI assistant path (still kept) reads `imageStyle` from a story to keep regenerated assets in style, KEEP it but note it's now unused in fresh V2 books — those use `art_style_id` instead.

If keeping: leave a one-line comment at the top of `image-styles.ts`:
```ts
// Kept for AI Assistant regeneration on legacy stories that have an `image_style` column.
// New V2 stories use `art_style_id` (see `art_styles` table).
```

- [ ] **Step 4: Decide `story-page-count.ts` fate.**

`grep -rn "MIN_STORY_PAGES\|MAX_STORY_PAGES\|isValidStoryPageCount" src/`. If only V1 used it, delete; otherwise leave.

- [ ] **Step 5: Build + commit.**

```bash
npm run build
# fix any TS errors by removing the relevant calls
git add -A src/app/api/generate src/lib
git commit -m "v1: delete /api/generate, V1 gemini wrappers, and now-unused style helpers"
```

---

## Task 3 — Delete pet routes and pages

**Files:**
- Delete: `src/app/pets/` (whole directory)
- Delete: `src/app/api/pets/` (whole directory)
- Delete: `src/app/create/page.tsx` (the V1 inline-form page)

- [ ] **Step 1: Delete.**

```bash
git rm -r src/app/pets
git rm -r src/app/api/pets
git rm src/app/create/page.tsx
```

If `src/app/create/` becomes empty after the second deletion, leave it — the `/create/new/` subdirectory inside it is the V2 wizard (still in use).

- [ ] **Step 2: Build + commit.**

```bash
npm run build
git add -A src/app
git commit -m "v1: delete pet routes, pet API, V1 create page"
```

---

## Task 4 — Delete pet components

**Files:**
- Delete: `src/components/PetForm.tsx`
- Delete: `src/components/PetPicker.tsx`
- Delete: `src/components/PetAvatar.tsx`
- Delete: `src/components/HomeCreate.tsx`

- [ ] **Step 1: Confirm none are still imported.**

Run for each:
```bash
grep -rn "PetForm\|PetPicker\|PetAvatar\|HomeCreate" src/
```

Expected: only the components themselves match (the import-target inside their own file). If anything else imports them, delete the import + the JSX usage in the same task.

- [ ] **Step 2: Delete.**

```bash
git rm src/components/PetForm.tsx src/components/PetPicker.tsx src/components/PetAvatar.tsx src/components/HomeCreate.tsx
```

- [ ] **Step 3: Update `Navbar.tsx`.** Remove the "Pets" link added in pre-V2 days. Verify "Characters" link added in Plan A is the only character-library link.

- [ ] **Step 4: Update `HeroSection.tsx`.** Strip any inline-form coupling that was preserved in Plan C. The hero is now CTAs only.

- [ ] **Step 5: Update `src/app/page.tsx`.** Remove any leftover `<HomeCreate />` import + JSX. The hero + Resume + library sections should be all that remains.

- [ ] **Step 6: Build + commit.**

```bash
npm run build
git add -A src/components src/app/page.tsx
git commit -m "v1: delete pet components + remove HomeCreate from home"
```

---

## Task 5 — Delete pet libraries + types

**Files:**
- Delete: `src/lib/pet-prompt.ts`
- Delete: `src/lib/quirk-bank.ts` (pet-only)
- Possibly delete: `src/lib/story-templates.ts`, `src/lib/story-starters.ts` (check if they're pet-only)
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Confirm `pet-prompt.ts` is unused.**

Run: `grep -rn "pet-prompt\|buildPetDescription\|composePetStoryPrompt\|buildPetStorySystemPrompt" src/`

Expected: only the file itself matches. Delete:
```bash
git rm src/lib/pet-prompt.ts
```

- [ ] **Step 2: Quirk bank.**

```bash
grep -rn "quirk-bank\|quirkBank\|QUIRK_BANK" src/
```

Should only match the file. Delete:
```bash
git rm src/lib/quirk-bank.ts
```

- [ ] **Step 3: Story templates / starters.**

For each of `src/lib/story-templates.ts` and `src/lib/story-starters.ts`, run a grep. If they're pet-only and unused now, delete. If a Plan-C surface (e.g. starter templates per recipient/occasion) still uses them, keep but trim pet-only entries. Document in the commit message what you did.

- [ ] **Step 4: Trim Pet types.**

In `src/lib/types.ts`, delete:
- `PetSpecies`, `PET_SPECIES`
- `PetMode`
- `PetQuirk`
- `Pet`
- `CreatePetInput`
- `GenerateRequest`, `GenerateResponse` (V1 request shapes; V2 uses `WizardPayload`)

Also remove pet-related optional fields on `Story`:
```ts
// REMOVE these lines from the Story interface:
kind?: "pet" | "generic";
pet_id?: string | null;
image_style?: string;
```

Add new optional fields to match the V2 `stories` columns:
```ts
recipient_type?: import("@/lib/types").RecipientType;
occasion?: import("@/lib/types").Occasion;
art_style_id?: string;
story_tone?: import("@/lib/types").StoryTone;
script?: import("@/lib/types").Script;
cast_character_ids?: string[];
```

(The dynamic-import-style cycles aren't needed since these types live in the same file — use the bare names.)

- [ ] **Step 5: Build.**

Run `npm run build`. Surface every TS error from the trim. Fix in this same task by removing the offending dead code (callers were V1; if a kept caller relies on a removed type, that's a real signal — re-evaluate).

- [ ] **Step 6: Commit.**

```bash
git add -A src/lib
git commit -m "v1: delete pet types, pet-prompt, quirk-bank; trim Story type"
```

---

## Task 6 — Database final cleanup

**Files:**
- Modify: `supabase/schema.sql` (light cleanup pass)

- [ ] **Step 1: Re-read `supabase/schema.sql`.** Confirm:
- The Plan A wipe block is still at the top.
- No `pets` references remain anywhere except inside the V2 wipe block (which drops the table).
- The `Stories` section's V2 columns are present (`recipient_type`, `occasion`, `art_style_id`, `story_tone`, `script`, `cast_character_ids`).
- The legacy `pet_id`, `kind`, `image_style` `drop column if exists` lines are present (so re-runs against any old DB that still has them clean up).

- [ ] **Step 2: Optional — drop legacy columns from older deploys.** If you want to be aggressive about pruning, append:

```sql
-- Final V2 cleanup of legacy story columns. Idempotent.
alter table public.stories drop column if exists pet_id;
alter table public.stories drop column if exists kind;
alter table public.stories drop column if exists image_style;
alter table public.stories drop column if exists library_images;
```

Skip `library_images` if the Studio still uses it (search `grep -rn "library_images" src/`).

- [ ] **Step 3: Commit.**

```bash
git add supabase/schema.sql
git commit -m "supabase: final V2 cleanup of legacy story columns"
```

---

## Task 7 — Final smoke test + docs

**Files:** none (or doc updates).

- [ ] **Step 1: End-to-end.** Boot dev + Inngest. Sign up fresh user. Walk wizard with a person + a pet character. Approve cast. Verify book generates. Verify cache hit on a second book reusing one character.

- [ ] **Step 2: Lint + build clean.**
```bash
npm run lint
npm run build
```

- [ ] **Step 3: Update `CLAUDE.md` (light touch).** Open `CLAUDE.md`. Find any V1-era prose:
- The "two flavors of input now: kind=generic / kind=pet" paragraph in `/api/generate` description.
- The `imageMode: "quality" | "fast"` paragraph.
- References to `pet-prompt.ts`, `pets` table, `quirk-bank.ts`.

Replace those passages with one paragraph describing the V2 flow:

> **Story generation (V2).** The creation surface is the 7-step wizard at `/create/new`. The wizard auto-saves to `story_drafts` and on submit calls `POST /api/generate/v2`, which inserts a `stories` row + `jobs` row and dispatches `EVENTS.storyGenerateV2`. The Inngest pipeline runs in two functions: `generateStoryV2Fn` (script + cast portraits) → user approves the cast at `/stories/[id]/approve-cast` → `generatePagesAfterApprovalFn` (page art using cast portraits as references). Cast portraits are cached per `(character_id, art_style_id)` in `character_portraits`. There is no V1 generator anymore.

- [ ] **Step 4: Commit doc.**

```bash
git add CLAUDE.md
git commit -m "docs: replace V1 generation paragraphs with V2 description"
```

---

## Plan D — completion criteria

- `grep -rn "Pet\b\|petId\|pet_id\|HomeCreate\|imageMode\|pet-prompt" src/` returns no V1 hits (only Plan A/B/C-era V2 references like the `Character` interface that contains a `kind: 'pet'`).
- `npm run build` and `npm run lint` are clean.
- `/create/new` wizard, `/characters` library, V2 pipeline all still work end-to-end.
- `CLAUDE.md` no longer documents V1 paths.
