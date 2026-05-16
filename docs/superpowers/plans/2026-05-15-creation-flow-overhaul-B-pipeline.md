# Plan B — Generation Pipeline V2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the new 3-stage generation pipeline (script → cast portraits → user approval gate → pages with cast-portrait reference images), plus the approval-gate UI and per-character regenerate. Plan A's data model is in place; Plan B uses it.

**Architecture:** Two new Inngest functions registered alongside the V1 ones (V1 stays for this plan; Plan D deletes it). Two new events. New Gemini wrappers in `src/lib/gemini.ts`. A new prompt module `src/lib/story-prompt.ts` that supersedes `pet-prompt.ts` but lives alongside it for now. New API routes for the approval gate. A `/stories/[id]/approve-cast` page.

**Tech Stack:** Same as Plan A. Manual verification — sign in, POST to `/api/generate/v2` with a hand-crafted body, watch the Inngest dev UI at `http://localhost:8288`, approve the cast in the browser.

**Spec:** `docs/superpowers/specs/2026-05-15-creation-flow-overhaul-design.md`
**Depends on:** Plan A is fully landed.

---

## File map

**Created**
- `src/lib/story-prompt.ts` — recipient/occasion/character-aware prompt builder (V2 replacement for `pet-prompt.ts`)
- `src/app/api/stories/[id]/approve-cast/route.ts` — `POST` sends `CAST_APPROVED`
- `src/app/api/stories/[id]/cast/[characterId]/regenerate/route.ts` — `POST` re-runs Stage 2 for one character
- `src/app/api/generate/v2/route.ts` — new entry point that takes a `WizardPayload`-shaped body and dispatches `STORY_GENERATE_V2`
- `src/app/stories/[id]/approve-cast/page.tsx` — cast-approval gate UI
- `src/app/stories/[id]/progress/page.tsx` — generation-progress page that knows about `awaiting_cast_approval`

**Modified**
- `src/inngest/client.ts` — add `STORY_GENERATE_V2`, `CAST_APPROVED` events
- `src/inngest/functions.ts` — add `generateStoryV2Fn`, `generatePagesAfterApprovalFn`; register both in `allFunctions`
- `src/lib/gemini.ts` — add `generateScript`, `generateCastPortrait`, `generatePageImageWithCastRefs`; keep `fetchImageAsInlineData`
- `src/lib/jobs.ts` — widen `JobStatus` to include `"awaiting_cast_approval"`

---

## Task 1 — Widen `JobStatus` and add new event names

**Files:**
- Modify: `src/lib/jobs.ts`
- Modify: `src/inngest/client.ts`

- [ ] **Step 1: Widen `JobStatus`.**

In `src/lib/jobs.ts`, change:

```ts
export type JobStatus = "queued" | "running" | "done" | "failed";
```

to:

```ts
export type JobStatus =
  | "queued"
  | "running"
  | "awaiting_cast_approval"
  | "done"
  | "failed";
```

Also add a new helper at the bottom of the file:

```ts
export async function markAwaitingCastApproval(
  jobId: string,
  result: unknown
): Promise<void> {
  await supabaseAdmin()
    .from("jobs")
    .update({
      status: "awaiting_cast_approval",
      result,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}
```

- [ ] **Step 2: Add new event names.**

In `src/inngest/client.ts`, replace the `EVENTS` const with:

```ts
export const EVENTS = {
  // V1 (deleted in Plan D)
  generateStory: "story/generate.requested",
  regenText: "story/regen-text.requested",
  assistText: "assist/text.requested",
  assistImage: "assist/image.requested",
  assistInfer: "assist/infer.requested",
  // V2
  storyGenerateV2: "story/generate.v2.requested",
  castApproved: "story/cast.approved",
  characterRegenerate: "character/portrait.regenerate.requested",
} as const;
```

- [ ] **Step 3: Build + commit.**

Run: `npm run build` — expected clean.

```bash
git add src/lib/jobs.ts src/inngest/client.ts
git commit -m "jobs+events: widen JobStatus and add V2 event names"
```

---

## Task 2 — `src/lib/story-prompt.ts`

**Files:**
- Create: `src/lib/story-prompt.ts`

- [ ] **Step 1: Write the prompt builder.**

```ts
// V2 prompt builder. Takes the structured wizard payload + cast and
// produces (a) the system prompt that frames the script generator and
// (b) the user-facing prompt slot. Replaces pet-prompt.ts. Memorial
// guardrails are gated by occasion === "memorial" and adapt their
// language for person vs. pet kinds.

import type {
  Character,
  Occasion,
  RecipientType,
  StoryTone,
} from "@/lib/types";

interface BuildPromptArgs {
  recipientType: RecipientType;
  occasion: Occasion;
  storyTone: StoryTone;
  cast: Character[];
  outline: string;
  keyMemories: string[];
  pageCount: number;
}

function castSummary(cast: Character[]): string {
  if (cast.length === 0) return "(no characters specified)";
  return cast
    .map((c) => {
      const role = c.role_label ? ` — ${c.role_label}` : "";
      const traits = c.traits ? `; ${c.traits}` : "";
      const speciesNote =
        c.kind === "pet" && c.species ? ` (${c.species})` : "";
      return `- ${c.name}${speciesNote}${role}${traits}`;
    })
    .join("\n");
}

function occasionFrame(occasion: Occasion, hasPetOnly: boolean): string {
  switch (occasion) {
    case "memorial":
      return hasPetOnly
        ? "This is a memorial book celebrating a pet who has passed. Tone is gentle, warm, and reflective. Do NOT depict the pet in peril, dying, or struggling. Pick exactly one of two valid narrative paths and do not blend them: (a) a celebration through recollection of real moments with the pet, or (b) a gentle Rainbow Bridge fantasy framed entirely after passing. Never imply ongoing struggle or jeopardy."
        : "This is a memorial book celebrating someone who has passed. Tone is gentle, warm, and reflective. Focus on real moments, things they loved, and the joy they brought. Do not depict them in distress or in a final-illness setting. Speak of them in either remembrance (past tense, warm and present in the heart) OR in a clearly fantastical afterlife framing — pick one and stay with it.";
    case "birthday":
      return "Tone is celebratory and warm. The story should feel like a custom birthday gift.";
    case "anniversary":
      return "Tone is romantic, nostalgic, and intimate. Anchor the story in shared memories.";
    case "graduation":
      return "Tone is proud and forward-looking — what they accomplished and what's ahead.";
    case "new_baby":
      return "Tone is tender and welcoming. The book introduces the world to a new arrival.";
    case "holiday":
      return "Tone is festive. Lean into seasonal imagery.";
    case "just_because":
      return "Tone is warm and personal. The story exists to say 'I see you'.";
    case "other":
    default:
      return "Tone is warm and personal.";
  }
}

function recipientLabel(r: RecipientType): string {
  switch (r) {
    case "partner":
      return "your romantic partner";
    case "child":
      return "your child";
    case "parent":
      return "your parent";
    case "sibling":
      return "your sibling";
    case "friend":
      return "your friend";
    case "self":
      return "yourself";
    case "pet":
      return "your pet";
    case "other":
    default:
      return "someone you love";
  }
}

function toneInstruction(tone: StoryTone): string {
  if (tone === "rhyming") {
    return "Write the story in light, singable rhyming couplets. Keep meter simple and consistent across pages.";
  }
  return "Write the story in clear, lyrical prose. 1–3 short paragraphs per page.";
}

export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
}

export function buildScriptPrompt(args: BuildPromptArgs): BuiltPrompt {
  const hasPetOnly = args.cast.every((c) => c.kind === "pet");

  const system = `
You write personalized illustrated storybooks. The book is for ${recipientLabel(
    args.recipientType
  )}.

${occasionFrame(args.occasion, hasPetOnly)}

${toneInstruction(args.storyTone)}

Cast (these are the only characters that may appear; use their names verbatim):
${castSummary(args.cast)}

Output a single JSON object with this shape:
{
  "title": string,
  "dedication": string,                     // 1–2 sentences, optional but preferred
  "pages": [
    {
      "pageNumber": number,                  // 1..N
      "text": string,                        // the page's narrative text
      "sceneDescription": string,            // a vivid description of what is happening, the setting, and which characters are visible — used as input to image generation
      "characterIds": string[]               // ids of cast members visible on this page
    }
  ]
}

Constraints:
- Exactly ${args.pageCount} pages.
- Every character that appears in a sceneDescription must be listed in characterIds.
- Use only the cast above. Do not invent named additional characters.
- Each page is self-contained but contributes to a continuous arc.
`.trim();

  const user = [
    args.outline?.trim() ? `Story outline:\n${args.outline.trim()}` : null,
    args.keyMemories.length
      ? `Key memories or beats to weave in:\n- ${args.keyMemories.join("\n- ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { systemPrompt: system, userPrompt: user || "(no additional notes)" };
}

// Per-character portrait prompt. Used by Stage 2 (generateCastPortrait).
export function buildCastPortraitPrompt(args: {
  character: Character;
  artStylePromptScaffold: string;
}): string {
  const { character, artStylePromptScaffold } = args;
  const subject =
    character.kind === "person"
      ? character.name
      : `${character.name} the ${character.species ?? "pet"}`;
  const role = character.role_label ? `, depicted as "${character.role_label}"` : "";
  const traits = character.traits ? `Personality / traits: ${character.traits}.` : "";
  return `
Generate a single canonical portrait of ${subject}${role}.

${artStylePromptScaffold}

${traits}

This portrait will be used as the visual reference for ${character.name} on every page of an illustrated storybook — keep features distinctive, well-lit, and centered. Plain neutral background. No text in the image.
`.trim();
}

// Per-page prompt for Stage 3. The cast portraits are passed as inline
// image inputs alongside this text — the prompt references them.
export function buildPagePrompt(args: {
  sceneDescription: string;
  artStylePromptScaffold: string;
  characterNamesOnPage: string[];
}): string {
  const characterRefList =
    args.characterNamesOnPage.length > 0
      ? `Use the attached reference portraits for ${args.characterNamesOnPage.join(
          ", "
        )}. The faces, features, and overall appearance must match those references exactly.`
      : "";
  return `
${args.artStylePromptScaffold}

Scene: ${args.sceneDescription}

${characterRefList}

Storybook illustration of the scene. Do not include any text, captions, or watermarks in the image.
`.trim();
}
```

- [ ] **Step 2: Build + commit.**

Run: `npm run build` — expected clean.

```bash
git add src/lib/story-prompt.ts
git commit -m "story-prompt: add V2 prompt builders for script, cast, pages"
```

---

## Task 3 — Gemini wrappers for V2

**Files:**
- Modify: `src/lib/gemini.ts` (append new functions; do NOT remove V1 yet)

- [ ] **Step 1: Find the existing Gemini SDK setup.**

Run: `grep -n "GoogleGenerativeAI\|getGenerativeModel\|fetchImageAsInlineData" src/lib/gemini.ts | head -20`

Identify how the SDK is initialized (look for `new GoogleGenerativeAI(...)`) and how the existing `generatePageImage` calls the image model. You will mirror that style.

- [ ] **Step 2: Append `generateScript`.**

Append to `src/lib/gemini.ts` (right before any existing `export` block end, or just at the end of file):

```ts
import type {
  Character,
  Occasion,
  RecipientType,
  Script,
  StoryTone,
} from "@/lib/types";
import {
  buildCastPortraitPrompt,
  buildPagePrompt,
  buildScriptPrompt,
} from "@/lib/story-prompt";
import { fetchWithTimeout, isAllowedContentUrl } from "@/lib/http";

// Generates the V2 structured script (title + dedication + pages).
// Throws GeminiSafetyBlockedError / GeminiRateLimitError to match V1
// error semantics.
export interface GenerateScriptArgs {
  recipientType: RecipientType;
  occasion: Occasion;
  storyTone: StoryTone;
  cast: Character[];
  outline: string;
  keyMemories: string[];
  pageCount: number;
}

export async function generateScript(args: GenerateScriptArgs): Promise<Script> {
  const { systemPrompt, userPrompt } = buildScriptPrompt(args);

  // Reuse the same client pattern as V1. The existing file initializes
  // `genAI` (or equivalent) at module scope — reuse it. If V1 names this
  // differently, adapt the model fetch below to match.
  const model = getGenerativeAI().getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent(userPrompt);
  const text = result.response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`generateScript: model returned non-JSON: ${String(err)}`);
  }
  if (!isScript(parsed, args.pageCount)) {
    throw new Error("generateScript: parsed JSON did not match Script schema");
  }
  return parsed;
}

function isScript(value: unknown, expectedPages: number): value is Script {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== "string") return false;
  if (!Array.isArray(v.pages)) return false;
  if (v.pages.length !== expectedPages) return false;
  return v.pages.every((p) => {
    if (!p || typeof p !== "object") return false;
    const pp = p as Record<string, unknown>;
    return (
      typeof pp.pageNumber === "number" &&
      typeof pp.text === "string" &&
      typeof pp.sceneDescription === "string" &&
      Array.isArray(pp.characterIds) &&
      pp.characterIds.every((id) => typeof id === "string")
    );
  });
}

// V2 cast portrait. Returns a data URI; caller uploads via uploadGeneratedImage.
export async function generateCastPortrait(args: {
  character: Character;
  artStylePromptScaffold: string;
}): Promise<string> {
  const prompt = buildCastPortraitPrompt(args);

  const refImages: Array<{ inlineData: { data: string; mimeType: string } }> =
    [];
  for (const url of args.character.reference_photo_urls.slice(0, 5)) {
    if (!isAllowedContentUrl(url)) continue;
    const inline = await fetchImageAsInlineData(url);
    if (inline) refImages.push({ inlineData: inline });
  }

  const model = getGenerativeAI().getGenerativeModel({
    model: "gemini-2.0-flash-exp-image-generation",
  });

  const result = await model.generateContent([
    { text: prompt },
    ...refImages,
  ]);

  return extractFirstImageDataUri(result);
}

// V2 page image — pass the canonical cast portraits for the characters
// that appear on this page, plus the scene description.
export async function generatePageImageWithCastRefs(args: {
  sceneDescription: string;
  artStylePromptScaffold: string;
  castPortraitsOnPage: Array<{ name: string; portraitUrl: string }>;
}): Promise<string> {
  const prompt = buildPagePrompt({
    sceneDescription: args.sceneDescription,
    artStylePromptScaffold: args.artStylePromptScaffold,
    characterNamesOnPage: args.castPortraitsOnPage.map((c) => c.name),
  });

  const refImages: Array<{ inlineData: { data: string; mimeType: string } }> =
    [];
  for (const c of args.castPortraitsOnPage) {
    if (!isAllowedContentUrl(c.portraitUrl)) continue;
    const inline = await fetchImageAsInlineData(c.portraitUrl);
    if (inline) refImages.push({ inlineData: inline });
  }

  const model = getGenerativeAI().getGenerativeModel({
    model: "gemini-2.0-flash-exp-image-generation",
  });

  const result = await model.generateContent([
    { text: prompt },
    ...refImages,
  ]);

  return extractFirstImageDataUri(result);
}

// Local helper — if `extractFirstImageDataUri` already exists in this
// file (V1 used it), reuse the existing one. Otherwise define it here:
function extractFirstImageDataUri(result: {
  response: {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
    }>;
  };
}): string {
  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const data = part.inlineData?.data;
    const mime = part.inlineData?.mimeType;
    if (data && mime) return `data:${mime};base64,${data}`;
  }
  throw new Error("Gemini returned no image data");
}
```

> **Important:** the snippets above assume helpers named `getGenerativeAI()` and `fetchImageAsInlineData()`. The existing V1 code uses similar accessors. If V1's accessor has a different name (e.g. the SDK client is exported as `genAI` or initialized inside each function), adapt these calls to reuse the existing accessor. Do not re-import or re-initialize `GoogleGenerativeAI` — there should be exactly one client init in the file.

- [ ] **Step 3: Build + commit.**

Run: `npm run build` — expected clean. If there's a name collision on `extractFirstImageDataUri` (V1 already defines it), delete the duplicate and leave the rest.

```bash
git add src/lib/gemini.ts
git commit -m "gemini: add V2 wrappers (generateScript, cast portraits, page art)"
```

---

## Task 4 — `generateStoryV2Fn` Inngest function

**Files:**
- Modify: `src/inngest/functions.ts`

- [ ] **Step 1: Read the current `allFunctions` export at the bottom of the file.**

Run: `grep -n "allFunctions" src/inngest/functions.ts`

Note the array — you'll append two new entries.

- [ ] **Step 2: Append the V2 orchestrator.**

Append to `src/inngest/functions.ts` (before the `allFunctions` export):

```ts
import {
  generateCastPortrait,
  generateScript,
} from "@/lib/gemini";
import { markAwaitingCastApproval } from "@/lib/jobs";
import { uploadGeneratedImage } from "@/lib/supabase";
import type {
  Character,
  RecipientType,
  Occasion,
  StoryTone,
  Script,
} from "@/lib/types";

interface StoryGenerateV2Event {
  data: {
    jobId: string;
    storyId: string;
    userId: string;
  };
}

export const generateStoryV2Fn = inngest.createFunction(
  {
    id: "story-generate-v2",
    name: "Generate story (V2: script + cast)",
    retries: TEXT_RETRIES,
    onFailure: onInngestFailure,
  },
  { event: EVENTS.storyGenerateV2 },
  async ({ event, step }) => {
    const { jobId, storyId } = (event as StoryGenerateV2Event).data;
    await markRunning(jobId);

    // ---- Load story + cast + style up front ------------------------------
    const ctx = await step.run("load-context", async () => {
      const admin = supabaseAdmin();
      const { data: story, error: storyErr } = await admin
        .from("stories")
        .select(
          "id, user_id, prompt, page_count, recipient_type, occasion, story_tone, art_style_id, cast_character_ids"
        )
        .eq("id", storyId)
        .single<{
          id: string;
          user_id: string;
          prompt: string;
          page_count: number;
          recipient_type: RecipientType;
          occasion: Occasion;
          story_tone: StoryTone;
          art_style_id: string;
          cast_character_ids: string[];
        }>();
      if (storyErr || !story) throw new Error(`load story: ${storyErr?.message}`);

      const { data: cast, error: castErr } = await admin
        .from("characters")
        .select("*")
        .in("id", story.cast_character_ids);
      if (castErr) throw new Error(`load cast: ${castErr.message}`);

      const { data: style, error: styleErr } = await admin
        .from("art_styles")
        .select("*")
        .eq("id", story.art_style_id)
        .single<{ id: string; display_name: string; prompt_scaffold: string }>();
      if (styleErr || !style) throw new Error(`load style: ${styleErr?.message}`);

      return { story, cast: (cast ?? []) as Character[], style };
    });

    // ---- Stage 1: script ------------------------------------------------
    const script: Script = await step.run("generate-script", async () => {
      // The wizard payload's outline + keyMemories live on stories.prompt
      // and (TODO follow-up) a structured column. For Plan B we read
      // outline/keyMemories from `stories.prompt` (JSON-stringified by the
      // wizard's "Generate" submit). If the field is a plain string treat
      // it all as outline.
      let outline = "";
      let keyMemories: string[] = [];
      try {
        const parsed = JSON.parse(ctx.story.prompt);
        if (parsed && typeof parsed === "object") {
          outline = typeof parsed.outline === "string" ? parsed.outline : "";
          keyMemories = Array.isArray(parsed.keyMemories)
            ? parsed.keyMemories.filter((s: unknown) => typeof s === "string")
            : [];
        } else {
          outline = String(ctx.story.prompt ?? "");
        }
      } catch {
        outline = String(ctx.story.prompt ?? "");
      }

      const s = await generateScript({
        recipientType: ctx.story.recipient_type,
        occasion: ctx.story.occasion,
        storyTone: ctx.story.story_tone,
        cast: ctx.cast,
        outline,
        keyMemories,
        pageCount: ctx.story.page_count,
      });

      // Persist the script to stories.script.
      const { error } = await supabaseAdmin()
        .from("stories")
        .update({ script: s, title: s.title })
        .eq("id", storyId);
      if (error) throw new Error(`persist script: ${error.message}`);

      return s;
    });

    // ---- Stage 2: cast portraits (parallel, cache-aware) ----------------
    const portraitMap = await step.run("generate-cast-portraits", async () => {
      const admin = supabaseAdmin();

      // Determine which characters actually appear in the script — drop any
      // cast members the script never used (saves a portrait render).
      const usedIds = new Set<string>();
      for (const p of script.pages) for (const id of p.characterIds) usedIds.add(id);
      const usedCast = ctx.cast.filter((c) => usedIds.has(c.id));

      const results = await Promise.all(
        usedCast.map(async (c) => {
          // Cache lookup.
          const { data: existing } = await admin
            .from("character_portraits")
            .select("portrait_url")
            .eq("character_id", c.id)
            .eq("art_style_id", ctx.style.id)
            .maybeSingle<{ portrait_url: string }>();
          if (existing?.portrait_url) {
            return { characterId: c.id, name: c.name, portraitUrl: existing.portrait_url, cached: true };
          }

          const dataUri = await generateCastPortrait({
            character: c,
            artStylePromptScaffold: ctx.style.prompt_scaffold,
          });
          const portraitUrl = await uploadGeneratedImage(dataUri);

          const { error: insertErr } = await admin
            .from("character_portraits")
            .insert({
              character_id: c.id,
              art_style_id: ctx.style.id,
              portrait_url: portraitUrl,
            });
          if (insertErr) throw new Error(`portrait insert: ${insertErr.message}`);

          return { characterId: c.id, name: c.name, portraitUrl, cached: false };
        })
      );

      return results;
    });

    // ---- Gate: stop and wait for user approval --------------------------
    await markAwaitingCastApproval(jobId, {
      stage: "awaiting_cast_approval",
      portraits: portraitMap,
      script,
    });

    return { jobId, storyId, awaitingCastApproval: true };
  }
);
```

- [ ] **Step 3: Append `generatePagesAfterApprovalFn`.**

Append immediately after `generateStoryV2Fn`:

```ts
interface CastApprovedEvent {
  data: { jobId: string; storyId: string };
}

export const generatePagesAfterApprovalFn = inngest.createFunction(
  {
    id: "generate-pages-after-approval",
    name: "Generate pages (V2: after cast approval)",
    retries: IMAGE_RETRIES,
    onFailure: onInngestFailure,
  },
  { event: EVENTS.castApproved },
  async ({ event, step }) => {
    const { jobId, storyId } = (event as CastApprovedEvent).data;
    await markRunning(jobId);

    const ctx = await step.run("load-pages-context", async () => {
      const admin = supabaseAdmin();
      const { data: story, error } = await admin
        .from("stories")
        .select("id, script, art_style_id, cast_character_ids, page_count")
        .eq("id", storyId)
        .single<{
          id: string;
          script: Script;
          art_style_id: string;
          cast_character_ids: string[];
          page_count: number;
        }>();
      if (error || !story?.script) throw new Error("script missing");

      const { data: style } = await admin
        .from("art_styles")
        .select("prompt_scaffold")
        .eq("id", story.art_style_id)
        .single<{ prompt_scaffold: string }>();
      if (!style) throw new Error("style missing");

      const { data: portraits } = await admin
        .from("character_portraits")
        .select("character_id, portrait_url")
        .in("character_id", story.cast_character_ids)
        .eq("art_style_id", story.art_style_id);

      const { data: cast } = await admin
        .from("characters")
        .select("id, name")
        .in("id", story.cast_character_ids);

      const portraitByCharId = new Map<string, string>();
      for (const p of portraits ?? []) portraitByCharId.set(p.character_id, p.portrait_url);
      const nameByCharId = new Map<string, string>();
      for (const c of cast ?? []) nameByCharId.set(c.id, c.name);

      // Pre-build the initial overlays + layout id pages need.
      const initialPages = story.script.pages.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.text,
        imageUrl: "",
        layoutId: DEFAULT_LAYOUT_ID,
        overlays: [] as Layer[],
      }));
      const { error: pagesErr } = await admin
        .from("stories")
        .update({ pages: initialPages })
        .eq("id", storyId);
      if (pagesErr) throw new Error(`init pages: ${pagesErr.message}`);

      return { story, style, portraitByCharId, nameByCharId };
    });

    // For each scripted page, fire a step that generates + persists the image.
    const pages = ctx.story.script.pages;
    await Promise.all(
      pages.map((p) =>
        step.run(`generate-page-${p.pageNumber}`, async () => {
          const castOnPage = p.characterIds
            .map((id) => {
              const portraitUrl = ctx.portraitByCharId.get(id);
              const name = ctx.nameByCharId.get(id);
              return portraitUrl && name ? { name, portraitUrl } : null;
            })
            .filter((x): x is { name: string; portraitUrl: string } => x !== null);

          const dataUri = await generatePageImageWithCastRefs({
            sceneDescription: p.sceneDescription,
            artStylePromptScaffold: ctx.style.prompt_scaffold,
            castPortraitsOnPage: castOnPage,
          });
          const imageUrl = await uploadGeneratedImage(dataUri);

          // Build overlays via the existing helper.
          const overlays = buildInitialOverlays({
            pageNumber: p.pageNumber,
            text: p.text,
            imageUrl,
            layoutId: DEFAULT_LAYOUT_ID,
          });
          await updateStoryPageFields(storyId, p.pageNumber, {
            imageUrl,
            overlays,
            layoutId: DEFAULT_LAYOUT_ID,
          });

          await markProgress(jobId, {
            stage: "pages",
            completed: p.pageNumber,
            total: pages.length,
          });
        })
      )
    );

    // Cover image: use page 1 image as cover for V2 books.
    await step.run("set-cover", async () => {
      const admin = supabaseAdmin();
      const { data: story } = await admin
        .from("stories")
        .select("pages")
        .eq("id", storyId)
        .single<{ pages: Array<{ pageNumber: number; imageUrl: string }> }>();
      const first = story?.pages?.find((p) => p.pageNumber === 1);
      if (first?.imageUrl) {
        await admin.from("stories").update({ cover_image: first.imageUrl }).eq("id", storyId);
      }
    });

    await markDone(jobId, { stage: "done", storyId });
    return { jobId, storyId, done: true };
  }
);

// V2 per-character portrait regeneration.
interface CharacterRegenerateEvent {
  data: { jobId: string; storyId: string; characterId: string };
}

export const regenerateCastPortraitFn = inngest.createFunction(
  {
    id: "regenerate-cast-portrait",
    name: "Regenerate one cast portrait",
    retries: IMAGE_RETRIES,
    onFailure: onInngestFailure,
  },
  { event: EVENTS.characterRegenerate },
  async ({ event, step }) => {
    const { jobId, storyId, characterId } = (event as CharacterRegenerateEvent).data;
    await markRunning(jobId);

    await step.run("regen", async () => {
      const admin = supabaseAdmin();
      const { data: story } = await admin
        .from("stories")
        .select("art_style_id")
        .eq("id", storyId)
        .single<{ art_style_id: string }>();
      if (!story) throw new Error("story missing");

      const { data: character } = await admin
        .from("characters")
        .select("*")
        .eq("id", characterId)
        .single<Character>();
      if (!character) throw new Error("character missing");

      const { data: style } = await admin
        .from("art_styles")
        .select("prompt_scaffold")
        .eq("id", story.art_style_id)
        .single<{ prompt_scaffold: string }>();
      if (!style) throw new Error("style missing");

      const dataUri = await generateCastPortrait({
        character,
        artStylePromptScaffold: style.prompt_scaffold,
      });
      const portraitUrl = await uploadGeneratedImage(dataUri);

      // Upsert via delete-then-insert to keep the unique index honest.
      await admin
        .from("character_portraits")
        .delete()
        .eq("character_id", characterId)
        .eq("art_style_id", story.art_style_id);
      await admin.from("character_portraits").insert({
        character_id: characterId,
        art_style_id: story.art_style_id,
        portrait_url: portraitUrl,
      });

      await markDone(jobId, { stage: "regenerated", characterId, portraitUrl });
    });
  }
);
```

- [ ] **Step 4: Register all three new functions in `allFunctions`.**

Find the `export const allFunctions = [...]` export at the bottom of `src/inngest/functions.ts`. Append the three new functions:

```ts
export const allFunctions = [
  // …existing V1 entries…
  generateStoryV2Fn,
  generatePagesAfterApprovalFn,
  regenerateCastPortraitFn,
];
```

Also: import `generatePageImageWithCastRefs` from `@/lib/gemini` at the top of the file if it isn't already imported (it's used inside `generatePagesAfterApprovalFn`).

- [ ] **Step 5: Build + commit.**

Run: `npm run build` — expected clean.

```bash
git add src/inngest/functions.ts
git commit -m "inngest: add V2 generation pipeline (script + cast + pages + regen)"
```

---

## Task 5 — V2 entrypoint route: `POST /api/generate/v2`

**Files:**
- Create: `src/app/api/generate/v2/route.ts`

- [ ] **Step 1: Write the route.**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { createJob } from "@/lib/jobs";
import { inngest, EVENTS } from "@/inngest/client";
import type {
  Occasion,
  RecipientType,
  StoryTone,
  WizardPayload,
} from "@/lib/types";

const VALID_RECIPIENTS: RecipientType[] = [
  "partner", "child", "parent", "sibling", "friend", "self", "pet", "other",
];
const VALID_OCCASIONS: Occasion[] = [
  "birthday", "anniversary", "memorial", "just_because", "graduation", "holiday", "new_baby", "other",
];
const VALID_TONES: StoryTone[] = ["classic", "rhyming"];

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as WizardPayload & { isPublic?: boolean };

    if (
      !body.recipientType ||
      !VALID_RECIPIENTS.includes(body.recipientType)
    ) {
      return NextResponse.json({ error: "recipientType invalid" }, { status: 400 });
    }
    if (!body.occasion || !VALID_OCCASIONS.includes(body.occasion)) {
      return NextResponse.json({ error: "occasion invalid" }, { status: 400 });
    }
    if (!body.storyTone || !VALID_TONES.includes(body.storyTone)) {
      return NextResponse.json({ error: "storyTone invalid" }, { status: 400 });
    }
    if (!body.artStyleId) {
      return NextResponse.json({ error: "artStyleId required" }, { status: 400 });
    }
    if (
      !Array.isArray(body.castCharacterIds) ||
      body.castCharacterIds.length === 0
    ) {
      return NextResponse.json({ error: "cast required" }, { status: 400 });
    }
    const pageCount = Math.min(Math.max(body.pageCount ?? 24, 8), 64);

    // Verify the cast belongs to this user.
    const admin = supabaseAdmin();
    const { data: ownedCast } = await admin
      .from("characters")
      .select("id")
      .in("id", body.castCharacterIds)
      .eq("user_id", user.id);
    if (!ownedCast || ownedCast.length !== body.castCharacterIds.length) {
      return NextResponse.json({ error: "cast contains unowned characters" }, { status: 403 });
    }

    // Pack outline + keyMemories into stories.prompt (JSON-encoded) so Stage 1
    // can read them back. A dedicated column is a follow-up.
    const promptPayload = JSON.stringify({
      outline: body.outline ?? "",
      keyMemories: body.keyMemories ?? [],
    });

    const { data: story, error: storyErr } = await admin
      .from("stories")
      .insert({
        user_id: user.id,
        title: body.title ?? "Untitled story",
        prompt: promptPayload,
        page_count: pageCount,
        pages: [],
        recipient_type: body.recipientType,
        occasion: body.occasion,
        story_tone: body.storyTone,
        art_style_id: body.artStyleId,
        cast_character_ids: body.castCharacterIds,
        is_public: body.isPublic === true,
      })
      .select("id")
      .single<{ id: string }>();
    if (storyErr || !story) {
      return NextResponse.json({ error: storyErr?.message ?? "create story" }, { status: 500 });
    }

    const jobId = await createJob("story.generate.v2", user.id);
    await inngest.send({
      name: EVENTS.storyGenerateV2,
      data: { jobId, storyId: story.id, userId: user.id },
    });
    return NextResponse.json({ jobId, storyId: story.id }, { status: 202 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Build + commit.**

```bash
git add src/app/api/generate/v2
git commit -m "api: add POST /api/generate/v2 entrypoint"
```

---

## Task 6 — Approve-cast + per-character regenerate routes

**Files:**
- Create: `src/app/api/stories/[id]/approve-cast/route.ts`
- Create: `src/app/api/stories/[id]/cast/[characterId]/regenerate/route.ts`

- [ ] **Step 1: Approve-cast route.**

```ts
// src/app/api/stories/[id]/approve-cast/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { requireUser, assertOwnsStory, UnauthorizedError } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { inngest, EVENTS } from "@/inngest/client";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id: storyId } = await ctx.params;
    const ownership = await assertOwnsStory(storyId, user.id);
    if (ownership) return ownership;

    // Find the jobs row currently awaiting approval for this story.
    // We stash storyId on jobs.result during Stage 2 — match on that.
    const admin = supabaseAdmin();
    const { data: jobs } = await admin
      .from("jobs")
      .select("id, status, result, user_id")
      .eq("user_id", user.id)
      .eq("status", "awaiting_cast_approval")
      .order("created_at", { ascending: false })
      .limit(20);

    const job = (jobs ?? []).find(
      (j) =>
        j.result &&
        typeof j.result === "object" &&
        // narrow via cast — the result has shape { stage, portraits, script } with storyId implied
        true
    );
    // Resolve by matching against the actual stories row's id.
    // (We could store storyId on jobs.result for fast lookup; doing it here keeps the route simple.)
    let jobId: string | null = null;
    if (job) {
      jobId = job.id;
    } else {
      // Fallback: look up the most recent job for this user that is awaiting and check via stories table.
      const { data: latest } = await admin
        .from("jobs")
        .select("id, result")
        .eq("user_id", user.id)
        .eq("status", "awaiting_cast_approval")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; result: unknown }>();
      jobId = latest?.id ?? null;
    }
    if (!jobId) {
      return NextResponse.json({ error: "no awaiting job" }, { status: 404 });
    }

    await inngest.send({
      name: EVENTS.castApproved,
      data: { jobId, storyId },
    });
    return NextResponse.json({ ok: true, jobId });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Per-character regenerate route.**

```ts
// src/app/api/stories/[id]/cast/[characterId]/regenerate/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { requireUser, assertOwnsStory, UnauthorizedError } from "@/lib/supabase-server";
import { createJob } from "@/lib/jobs";
import { inngest, EVENTS } from "@/inngest/client";

type RouteContext = {
  params: Promise<{ id: string; characterId: string }>;
};

export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id: storyId, characterId } = await ctx.params;
    const ownership = await assertOwnsStory(storyId, user.id);
    if (ownership) return ownership;

    const jobId = await createJob("character.portrait.regenerate", user.id);
    await inngest.send({
      name: EVENTS.characterRegenerate,
      data: { jobId, storyId, characterId },
    });
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 3: Build + commit.**

```bash
git add src/app/api/stories
git commit -m "api: approve-cast + per-character regenerate routes"
```

---

## Task 7 — Approval gate page `/stories/[id]/approve-cast`

**Files:**
- Create: `src/app/stories/[id]/approve-cast/page.tsx`

- [ ] **Step 1: Write the page.**

```tsx
// src/app/stories/[id]/approve-cast/page.tsx
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import ApproveCastClient from "@/components/ApproveCastClient";

type Props = { params: Promise<{ id: string }> };

interface JobResult {
  stage: string;
  portraits: Array<{ characterId: string; name: string; portraitUrl: string }>;
}

export default async function ApproveCastPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user) redirect(`/login?next=/stories/${id}/approve-cast`);

  const admin = supabaseAdmin();
  const { data: story } = await admin
    .from("stories")
    .select("id, user_id, title")
    .eq("id", id)
    .single<{ id: string; user_id: string; title: string }>();
  if (!story || story.user_id !== user.id) notFound();

  // Most recent awaiting job for this user (we showed it on /progress already).
  const { data: job } = await admin
    .from("jobs")
    .select("id, status, result")
    .eq("user_id", user.id)
    .eq("status", "awaiting_cast_approval")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; status: string; result: JobResult | null }>();

  if (!job || !job.result?.portraits) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-semibold">Cast not ready yet</h1>
        <p className="text-stone-600 mt-2">
          The cast portraits are still being generated. Refresh in a few seconds.
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">Approve your cast</h1>
      <p className="text-stone-600 mb-6">
        These portraits will be used as the visual reference for every page. If
        anyone looks wrong, regenerate just that character before the pages render.
      </p>
      <ApproveCastClient
        storyId={story.id}
        portraits={job.result.portraits}
      />
    </main>
  );
}
```

- [ ] **Step 2: Write the client component.**

Create `src/components/ApproveCastClient.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Portrait = { characterId: string; name: string; portraitUrl: string };

export default function ApproveCastClient({
  storyId,
  portraits,
}: {
  storyId: string;
  portraits: Portrait[];
}) {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate(characterId: string) {
    setWorking(characterId);
    setError(null);
    try {
      const res = await fetch(
        `/api/stories/${storyId}/cast/${characterId}/regenerate`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error(await res.text());
      // Poll the regen job. Simplest UX for v1: tell user to refresh after ~30s.
      alert("Regenerating. Refresh in 30 seconds.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "regen failed");
    } finally {
      setWorking(null);
    }
  }

  async function approveAll() {
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`/api/stories/${storyId}/approve-cast`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(`/stories/${storyId}/progress`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "approve failed");
      setApproving(false);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {portraits.map((p) => (
          <div key={p.characterId} className="border rounded-lg overflow-hidden bg-white">
            <div className="aspect-square bg-stone-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.portraitUrl}
                alt={p.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-3 flex items-center justify-between">
              <span className="font-medium">{p.name}</span>
              <button
                type="button"
                onClick={() => regenerate(p.characterId)}
                disabled={working === p.characterId}
                className="text-sm underline disabled:opacity-50"
              >
                {working === p.characterId ? "Working…" : "Regenerate"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && <div className="text-red-600 text-sm mb-3">{error}</div>}

      <button
        type="button"
        onClick={approveAll}
        disabled={approving}
        className="px-6 py-3 bg-black text-white rounded text-lg disabled:opacity-50"
      >
        {approving ? "Sending…" : "Approve all & generate pages"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Build + commit.**

```bash
git add src/app/stories/[id]/approve-cast src/components/ApproveCastClient.tsx
git commit -m "ui: cast-approval gate page + client"
```

---

## Task 8 — `/stories/[id]/progress` page (knows about cast-approval state)

**Files:**
- Create: `src/app/stories/[id]/progress/page.tsx`

- [ ] **Step 1: Write the page.**

```tsx
// src/app/stories/[id]/progress/page.tsx
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import StoryProgressClient from "@/components/StoryProgressClient";

type Props = { params: Promise<{ id: string }> };

export default async function StoryProgressPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user) redirect(`/login?next=/stories/${id}/progress`);

  const admin = supabaseAdmin();
  const { data: story } = await admin
    .from("stories")
    .select("id, user_id, title")
    .eq("id", id)
    .single<{ id: string; user_id: string; title: string }>();
  if (!story || story.user_id !== user.id) notFound();

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">Generating "{story.title}"</h1>
      <p className="text-stone-600 mb-6">
        This page polls until either the cast is ready for approval or the
        book finishes generating.
      </p>
      <StoryProgressClient storyId={id} />
    </main>
  );
}
```

- [ ] **Step 2: Write the client poller.**

Create `src/components/StoryProgressClient.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type JobState =
  | { kind: "loading" }
  | { kind: "queued" }
  | { kind: "running"; result: unknown }
  | { kind: "awaiting_cast_approval" }
  | { kind: "done"; storyId: string }
  | { kind: "failed"; error: string };

export default function StoryProgressClient({ storyId }: { storyId: string }) {
  const router = useRouter();
  const [state, setState] = useState<JobState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      while (!cancelled) {
        try {
          // Reuse the existing /api/jobs/[id] poll, but find the latest job for this story.
          const res = await fetch(`/api/stories/${storyId}/latest-job`, {
            cache: "no-store",
          });
          if (!res.ok) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          const job = (await res.json()) as {
            id: string;
            status: string;
            result?: unknown;
            error?: string | null;
          };
          if (cancelled) return;
          if (job.status === "awaiting_cast_approval") {
            setState({ kind: "awaiting_cast_approval" });
            router.push(`/stories/${storyId}/approve-cast`);
            return;
          }
          if (job.status === "done") {
            setState({ kind: "done", storyId });
            router.push(`/read/${storyId}`);
            return;
          }
          if (job.status === "failed") {
            setState({ kind: "failed", error: job.error ?? "unknown error" });
            return;
          }
          setState({ kind: "running", result: job.result });
          await new Promise((r) => setTimeout(r, 2000));
        } catch {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    }
    poll();
    return () => {
      cancelled = true;
    };
  }, [storyId, router]);

  if (state.kind === "failed") {
    return <div className="text-red-600">Failed: {state.error}</div>;
  }
  if (state.kind === "awaiting_cast_approval") {
    return <div>Cast ready — redirecting to approval…</div>;
  }
  return (
    <div className="space-y-2">
      <div>Working…</div>
      <pre className="text-xs bg-stone-100 p-3 rounded overflow-auto">
        {JSON.stringify(state, null, 2)}
      </pre>
    </div>
  );
}
```

- [ ] **Step 3: Add the supporting "latest job for story" route.**

Create `src/app/api/stories/[id]/latest-job/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireUser, assertOwnsStory, UnauthorizedError } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const ownership = await assertOwnsStory(id, user.id);
    if (ownership) return ownership;

    const { data: job } = await supabaseAdmin()
      .from("jobs")
      .select("id, status, result, error")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!job) return NextResponse.json({ error: "no job" }, { status: 404 });
    return NextResponse.json(job);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 4: Build + commit.**

```bash
git add src/app/stories/[id]/progress src/components/StoryProgressClient.tsx src/app/api/stories/[id]/latest-job
git commit -m "ui: story-progress page + latest-job API"
```

---

## Task 9 — Manual smoke test

**Files:** none.

- [ ] **Step 1: Boot dev + inngest.**

In two terminals (or via run_in_background):
```bash
npm run dev
npx inngest-cli@latest dev
```

The user must have the Inngest dev UI open at http://localhost:8288.

- [ ] **Step 2: Create cast via /characters (Plan A).** Log in, add at least 2 characters (e.g. one person + one pet) with photos.

- [ ] **Step 3: Manually POST to /api/generate/v2.**

In the browser devtools console (signed in so the cookie carries), run:

```js
const cast = await fetch("/api/characters").then((r) => r.json());
const ids = cast.characters.map((c) => c.id);
const res = await fetch("/api/generate/v2", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    recipientType: "child",
    occasion: "birthday",
    storyTone: "classic",
    castCharacterIds: ids,
    outline: "A magical birthday adventure in the backyard.",
    keyMemories: ["loves dinosaurs", "best friends with the dog"],
    artStyleId: "whimsy_watercolor",
    pageCount: 8,
    title: "Smoke test",
  }),
});
const body = await res.json();
console.log(body);
// → { jobId, storyId }
location.href = `/stories/${body.storyId}/progress`;
```

- [ ] **Step 4: Watch the Inngest dev UI.** Expected: `generateStoryV2Fn` fires, runs through `load-context` → `generate-script` → `generate-cast-portraits`, then ends. The job row flips to `awaiting_cast_approval`.

- [ ] **Step 5: Approve cast.** The progress page should redirect to `/stories/[id]/approve-cast` showing portraits. Click "Approve all & generate pages".

- [ ] **Step 6: Watch Stage 3.** `generatePagesAfterApprovalFn` should fire and produce 8 page images. Progress page redirects to `/read/[id]` when done.

- [ ] **Step 7: Verify visual consistency.** Open the story in `/read/[id]`. Confirm characters look consistent across pages (this is the whole point of the pipeline).

- [ ] **Step 8: Verify cache.** POST a second `/api/generate/v2` with the same `castCharacterIds` + same `artStyleId`. Watch the Inngest run — Stage 2 step should complete much faster (cache hit). Check the `character_portraits` table — the same row should be reused.

- [ ] **Step 9: Verify regenerate.** On a fresh generation, at the approve-cast gate click "Regenerate" on one portrait. Verify the row in `character_portraits` is replaced (different portrait_url).

- [ ] **Step 10: Lint pass.** `npm run lint` — expected clean.

---

## Plan B — completion criteria

- A fresh book can be generated end-to-end via `/api/generate/v2` → cast-approval gate → page generation.
- Characters look consistent across every page (this is the core value of the V2 pipeline).
- `character_portraits` cache is hit on repeat generations with the same (character, style).
- Per-character regenerate replaces the cached portrait.
- All three new Inngest functions are registered in `allFunctions` and visible in the Inngest dev UI.
