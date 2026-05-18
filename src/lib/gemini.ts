import { GoogleGenerativeAI } from "@google/generative-ai";
import { fetchWithTimeout, isAllowedContentUrl, withTimeout } from "@/lib/http";
import { assertGeminiGlobalCap } from "@/lib/rate-limit";

export { GeminiDailyCapExceededError } from "@/lib/rate-limit";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Upper-bound how long we wait on any single Gemini call. Text is fast
// (<5s typical, ~15s tail). Image gen is slower (~20s typical, ~60s
// tail). Use separate budgets so a stuck text call doesn't block an
// entire inngest function run and image-gen has headroom on cold paths.
const GEMINI_TEXT_TIMEOUT_MS = 30_000;
const GEMINI_IMAGE_TIMEOUT_MS = 90_000;
const IMAGE_FETCH_TIMEOUT_MS = 10_000;

// Remove ```json ... ``` / ``` ... ``` fences and surrounding whitespace
// so JSON.parse works on mildly-chatty model output. Gemini with
// responseMimeType=application/json usually returns bare JSON, but a
// flaky response still occasionally includes a code block when the model
// apologizes or prefaces — this keeps the happy path on the rails
// without us falling back to "both targets" for a formatting hiccup.
function stripCodeFences(raw: string): string {
  let text = raw.trim();
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i;
  const m = text.match(fence);
  if (m) text = m[1].trim();
  return text;
}

// Parse JSON from an LLM response, stripping code fences first. Throws a
// typed error so callers can decide whether to fall back, reprompt, or
// surface to the user. `raw` may be any string — we don't trust the
// shape. Callers should validate the resulting unknown themselves.
export class LlmJsonParseError extends Error {
  raw: string;
  constructor(raw: string, cause?: unknown) {
    super(
      `Failed to parse JSON from model response${
        cause instanceof Error ? `: ${cause.message}` : ""
      }`
    );
    this.name = "LlmJsonParseError";
    this.raw = raw;
  }
}

function parseJsonResponse(raw: string): unknown {
  const cleaned = stripCodeFences(raw);
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new LlmJsonParseError(raw, err);
  }
}


export async function regeneratePageText(
  storyTitle: string,
  allPages: { pageNumber: number; text: string }[],
  targetPageNumber: number
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const context = allPages
    .map((p) =>
      p.pageNumber === targetPageNumber
        ? `Page ${p.pageNumber} (rewrite this one): ${p.text}`
        : `Page ${p.pageNumber}: ${p.text}`
    )
    .join("\n");

  const result = await withGeminiRetry(
    async () => {
      const r = await withTimeout(
        model.generateContent(
          `You are revising one page of a children's storybook titled "${storyTitle}". Rewrite only page ${targetPageNumber} in a fresh way — a different turn of phrase, a new sensory detail — while keeping the plot beat, characters, and tone consistent with the surrounding pages. Keep it to 2-4 whimsical sentences suitable for illustration.

Return JSON: { "text": "..." }

Story so far:
${context}`
        ),
        GEMINI_TEXT_TIMEOUT_MS,
        "regeneratePageText"
      );
      assertSafeFinish(r, "regeneratePageText");
      return r;
    },
    { label: "regeneratePageText" }
  );

  const parsed = parseJsonResponse(result.response.text()) as { text?: unknown };
  if (typeof parsed.text !== "string" || !parsed.text.trim()) {
    throw new Error("Gemini regen-text response missing text field");
  }
  return parsed.text;
}

export class GeminiRateLimitError extends Error {
  constructor(message = "Gemini rate limit hit — try again in a minute.") {
    super(message);
    this.name = "GeminiRateLimitError";
  }
}

// Thrown when Gemini's safety filter rejects the prompt or its own
// response (finishReason: SAFETY / RECITATION / BLOCKLIST /
// PROHIBITED_CONTENT / SPII / etc.). These are deterministic at the
// content level — retrying with identical input will fail identically
// — so the Inngest onFailure handler maps them to a user-facing
// "rewrite your prompt" message rather than burning retries.
export class GeminiSafetyBlockedError extends Error {
  // Raw reason string from Gemini for debugging (SAFETY / RECITATION /
  // BLOCKLIST / etc.). Surfaced in logs but never in the user message.
  reason: string;
  // Optional context label (which call site tripped it) so logs are
  // easy to grep — "generateStoryText", "generatePageImage", etc.
  label: string;
  constructor(reason: string, label: string) {
    super(
      "Your prompt was blocked by the safety filter. Please try a gentler wording — for example, avoid graphic injuries or distressing content."
    );
    this.name = "GeminiSafetyBlockedError";
    this.reason = reason;
    this.label = label;
  }
}

// Set of finishReason strings we treat as a hard "content was blocked,
// don't retry" signal. STOP is normal completion. MAX_TOKENS is a
// length cutoff — not a safety block, retrying with a higher limit
// could help, but it's not what we're handling here. Anything in this
// set raises a GeminiSafetyBlockedError that bubbles out of any retry
// loop.
const SAFETY_FINISH_REASONS = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII", // sensitive PII filter
  "IMAGE_SAFETY",
  "LANGUAGE",
]);

// Inspect a Gemini response and throw if its finishReason indicates a
// safety / policy block. Called immediately after each
// `model.generateContent()` resolves — before we read .text() or .parts
// — so we fail fast with a typed error instead of bubbling a confusing
// "no text" / "no inlineData" downstream.
//
// The SDK shape is { response: { candidates?: [{ finishReason?: string }] } }
// and we accept a loose `unknown` here because the typed
// GenerateContentResult only narrows `response` to have `text()` —
// `candidates` is on the underlying generated content. Keeping the
// signature `unknown` avoids a TS-2339 cascade for callers that use
// the SDK's wrapped type.
function assertSafeFinish(result: unknown, label: string): void {
  const candidates = (
    result as {
      response?: {
        candidates?: Array<{ finishReason?: string }>;
        promptFeedback?: { blockReason?: string };
      };
    }
  )?.response?.candidates;
  const first = candidates?.[0];
  const reason = first?.finishReason;
  if (reason && reason !== "STOP" && SAFETY_FINISH_REASONS.has(reason)) {
    throw new GeminiSafetyBlockedError(reason, label);
  }
  // Some failures show up as a prompt-level block (no candidates at
  // all, just a `promptFeedback.blockReason`). Treat those as the
  // same class of failure.
  const promptBlock = (
    result as {
      response?: { promptFeedback?: { blockReason?: string } };
    }
  )?.response?.promptFeedback?.blockReason;
  if (!first && promptBlock) {
    throw new GeminiSafetyBlockedError(promptBlock, label);
  }
}

function is429(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const maybe = err as { status?: number; message?: string };
  if (maybe.status === 429) return true;
  return typeof maybe.message === "string" && maybe.message.includes("[429");
}

async function withGeminiRetry<T>(
  fn: () => Promise<T>,
  opts: { label: string; maxAttempts?: number } = { label: "gemini" }
): Promise<T> {
  // Global daily ceiling. Every Gemini call (text or image) routes
  // through here, so this is the single chokepoint where we count
  // calls toward GEMINI_DAILY_CAP. Once exceeded, this throws
  // GeminiDailyCapExceededError before we burn a network round-trip.
  // Routes can map that error to a 503 "Service paused for the day,
  // try again tomorrow." response.
  await assertGeminiGlobalCap();

  const maxAttempts = opts.maxAttempts ?? 3;
  const delays = [2000, 5000];
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Safety / policy blocks are deterministic on the input — they
      // will fail identically on every retry. Bail immediately and
      // let the route surface a "please rewrite your prompt" message.
      if (err instanceof GeminiSafetyBlockedError) throw err;
      if (!is429(err) || attempt === maxAttempts - 1) break;
      const wait = delays[attempt] ?? 5000;
      console.warn(
        `[gemini] ${opts.label} hit 429, retrying in ${wait}ms (attempt ${
          attempt + 1
        }/${maxAttempts})`
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  if (is429(lastErr)) throw new GeminiRateLimitError();
  throw lastErr;
}

function buildAssistantPreamble(systemPrompt: string | null): string {
  const trimmed = systemPrompt?.trim();
  return trimmed
    ? `The user has set these standing instructions for the AI assistant. Follow them unless the specific request below contradicts them:\n${trimmed}\n\n`
    : "";
}

// Fetch an image URL and return it in Gemini's inlineData format so we can
// pass "here's the current illustration" as context. Falls back to null if
// the URL is empty/invalid/disallowed — the caller proceeds without the
// visual context rather than failing outright.
//
// Security: `url` is read from the stories table and is therefore
// user-influenceable (via library_images, imageUrl, cover_image). We
// restrict the host to our Supabase project (or ALLOWED_IMAGE_HOSTS) so
// an attacker who inserts a story with a crafted URL can't trick the
// server into fetching internal cloud-metadata or LAN addresses.
async function fetchImageAsInlineData(
  url: string | null | undefined
): Promise<{ mimeType: string; data: string } | null> {
  if (!url) return null;
  try {
    if (url.startsWith("data:")) {
      const m = /^data:([^;]+);base64,(.+)$/.exec(url);
      if (!m) return null;
      return { mimeType: m[1], data: m[2] };
    }
    if (!isAllowedContentUrl(url)) {
      console.warn(
        "[gemini] refusing to fetch image from disallowed host:",
        safeHost(url)
      );
      return null;
    }
    const res = await fetchWithTimeout(url, {}, IMAGE_FETCH_TIMEOUT_MS);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const mimeType = res.headers.get("content-type") ?? "image/png";
    return { mimeType, data: Buffer.from(buf).toString("base64") };
  } catch (err) {
    console.error("[gemini] failed to fetch current image for context:", err);
    return null;
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "<invalid-url>";
  }
}

export interface AssistRegenerateTextArgs {
  systemPrompt: string | null;
  storyTitle: string;
  storyPrompt: string;
  allPages: { pageNumber: number; text: string }[];
  targetPageNumber: number;
  userPrompt: string;
  // Current illustration for the target page. Passed as multimodal context
  // so the rewritten text can reference what's actually drawn.
  currentImageUrl?: string | null;
}

export async function assistRegenerateText(
  args: AssistRegenerateTextArgs
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const context = args.allPages
    .map((p) =>
      p.pageNumber === args.targetPageNumber
        ? `Page ${p.pageNumber} (current text — rewrite this one): ${p.text}`
        : `Page ${p.pageNumber}: ${p.text}`
    )
    .join("\n");

  const textPart = {
    text: `${buildAssistantPreamble(args.systemPrompt)}You are revising page ${args.targetPageNumber} of a children's storybook titled "${args.storyTitle}". The original idea behind the story was: "${args.storyPrompt}".

THE USER'S REQUEST BELOW IS THE PRIMARY GOAL. Rewrite this page's narration so it actually reflects the user's request. When the request conflicts with what the surrounding pages establish (e.g. the user wants a different character, species, or setting), FOLLOW THE USER — the surrounding context is only a reference, not a constraint. Don't keep a name, species, role, or scene element if the user told you to change it.

Keep the rewrite to 2-4 whimsical sentences suitable for illustration. Match tone with the rest of the book where it doesn't conflict with the request. Do not include any text that doesn't belong to the narration (no labels, no meta commentary).

User's request for page ${args.targetPageNumber}: ${args.userPrompt}

Return JSON: { "text": "..." }

Story so far (for reference only — override freely to satisfy the request):
${context}`,
  };

  const imageInline = await fetchImageAsInlineData(args.currentImageUrl);
  const parts = imageInline
    ? [{ inlineData: imageInline }, textPart]
    : [textPart];

  const result = await withGeminiRetry(
    async () => {
      const r = await withTimeout(
        model.generateContent({ contents: [{ role: "user", parts }] }),
        GEMINI_TEXT_TIMEOUT_MS,
        "assistRegenerateText"
      );
      assertSafeFinish(r, "assistRegenerateText");
      return r;
    },
    { label: "assistRegenerateText" }
  );

  const parsed = parseJsonResponse(result.response.text()) as {
    text?: unknown;
  };
  if (typeof parsed.text !== "string" || !parsed.text.trim()) {
    throw new Error("Gemini assist-text response missing text field");
  }
  return parsed.text;
}

export interface AssistRegenerateImageArgs {
  systemPrompt: string | null;
  storyTitle: string;
  storyPrompt: string;
  pageText: string;
  userPrompt: string;
  // The illustration currently on the page, passed as visual context so
  // Gemini can edit it (keeping character/scene consistency) rather than
  // starting from scratch.
  currentImageUrl?: string | null;
  // Story's chosen art style. Gets folded into the prompt so the
  // regenerated image stays in the same look as the rest of the book.
  styleId?: string | null;
}

export async function assistRegenerateImage(
  args: AssistRegenerateImageArgs
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-image-preview",
  });

  const imageInline = await fetchImageAsInlineData(args.currentImageUrl);
  const hasCurrent = imageInline !== null;

  // styleId is a V2 art_styles.id (e.g. "whimsy_watercolor"). The
  // assistant doesn't currently look that up — it relies on the
  // attached image to keep the regenerated page in style. A generic
  // style note is sufficient here; full per-style prompt scaffolds
  // live in `public.art_styles.prompt_scaffold` and are applied by
  // the main generator in src/inngest/functions.ts.
  const styleNote =
    "Painterly children's storybook illustration matching the look and feel of the attached page.";

  const intro = [
    `${buildAssistantPreamble(args.systemPrompt)}${
      hasCurrent
        ? `The attached image is the current illustration for this page. Produce a revised illustration that keeps its overall composition, characters, and style where possible, and applies only the user's requested changes. Keep the character's identity (fur, markings, proportions) IDENTICAL — do not redesign the character.`
        : `Create a beautiful children's storybook illustration for one page of the story titled "${args.storyTitle}". The original idea behind the story was: "${args.storyPrompt}".`
    }`,
    `CRITICAL: The output image must contain ZERO text, ZERO letters, ZERO words, ZERO captions, ZERO writing of any kind. This is an illustration only — narration is overlaid separately.`,
    `Scene on this page: ${args.pageText}`,
    `The user's specific request for this illustration: ${args.userPrompt}`,
    `${styleNote} High-fidelity finished illustration. REMINDER: absolutely NO text, letters, words, captions, signs, or writing anywhere in the image.`,
  ].join("\n\n");

  const parts = imageInline
    ? [{ inlineData: imageInline }, { text: intro }]
    : [{ text: intro }];

  const result = await withGeminiRetry(
    async () => {
      const r = await withTimeout(
        model.generateContent({
          contents: [{ role: "user", parts }],
          generationConfig: {
            // @ts-expect-error - field not declared in legacy SDK types
            responseModalities: ["IMAGE", "TEXT"],
          },
        }),
        GEMINI_IMAGE_TIMEOUT_MS,
        "assistRegenerateImage"
      );
      assertSafeFinish(r, "assistRegenerateImage");
      return r;
    },
    { label: "assistRegenerateImage" }
  );

  const respParts = result.response.candidates?.[0]?.content?.parts;
  if (respParts) {
    for (const part of respParts) {
      if (part.inlineData?.data) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
  }

  throw new Error("Gemini returned no image data");
}

// ---------------------------------------------------------------------------
// Intent classifier — used by /ai/infer so one prompt + one button can decide
// whether the user's instruction should regenerate the page's text, the
// illustration, or both. Kept on flash so the extra hop is cheap. Returns
// at least one target; falls back to ["text","image"] if the model response
// is unparseable so the user still gets *something* useful.
// ---------------------------------------------------------------------------

export type AssistTarget = "text" | "image";

export interface ClassifyAssistIntentArgs {
  systemPrompt: string | null;
  // Story-wide context helps classify character/setting changes correctly:
  // if the user says "make Timmy a cow" and the page's narration doesn't
  // name Timmy but the story prompt or neighbor pages do, we still want
  // BOTH so the whole book stays consistent.
  storyPrompt?: string;
  allPagesText?: string; // concatenated "Page N: ..." for all pages
  pageText: string;
  userPrompt: string;
  currentImageUrl?: string | null;
}

export async function classifyAssistIntent(
  args: ClassifyAssistIntentArgs
): Promise<AssistTarget[]> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const storyContext = [
    args.storyPrompt ? `Story premise: "${args.storyPrompt}"` : null,
    args.allPagesText ? `All pages of the book:\n${args.allPagesText}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const textPart = {
    text: `${buildAssistantPreamble(args.systemPrompt)}You are classifying a user's edit instruction for one page of a children's storybook. Each page has TEXT (narration) and an IMAGE (illustration).

STRONG DEFAULT: ["text","image"] (both). Pick this unless there's an obvious, narrowly-scoped reason not to. The user is editing a keepsake — predictability and visual continuity matter more than saving a few API calls.

You may downgrade to ["text"] ONLY when the instruction is a tiny, mechanical rewording with literally zero implications for the picture. Examples that qualify:
  - "rewrite this rhyming"
  - "make this shorter / longer"
  - "use simpler words"
  - "change the tense to past"
If the new wording could plausibly imply ANY visual change (different mood, different color hint, different action, new character detail), keep ["text","image"].

You may downgrade to ["image"] ONLY when the instruction is a pure visual styling tweak that doesn't describe anything the narration mentions. Examples that qualify:
  - "warmer color palette"
  - "add more texture"
  - "softer lighting"
  - "less blur"
If the request mentions a character, an action, an object, the setting, the time of day, the weather, or a mood, keep ["text","image"].

Anything else — character changes (name, species, appearance), setting changes, action changes, plot beats, new objects, new characters, mood shifts, time/weather, "make it more X" where X is anything other than a pure typography concept — STAYS ["text","image"]. When in genuine doubt, ["text","image"] always wins.

Use the full book context — a character may appear in other pages even if this specific page's text is generic.

${storyContext ? `${storyContext}\n\n` : ""}Target page text (the one being revised): "${args.pageText}"
${args.currentImageUrl ? "The current illustration for the target page is attached." : "(No current illustration.)"}

User's instruction: "${args.userPrompt}"

Respond ONLY as JSON: { "targets": ["text"] } OR { "targets": ["image"] } OR { "targets": ["text","image"] }.`,
  };

  const imageInline = await fetchImageAsInlineData(args.currentImageUrl);
  const parts = imageInline
    ? [{ inlineData: imageInline }, textPart]
    : [textPart];

  try {
    const result = await withGeminiRetry(
      async () => {
        const r = await withTimeout(
          model.generateContent({ contents: [{ role: "user", parts }] }),
          GEMINI_TEXT_TIMEOUT_MS,
          "classifyAssistIntent"
        );
        assertSafeFinish(r, "classifyAssistIntent");
        return r;
      },
      { label: "classifyAssistIntent" }
    );
    const raw = result.response.text();
    const parsed = parseJsonResponse(raw) as { targets?: unknown };
    const targets = Array.isArray(parsed.targets)
      ? parsed.targets.filter(
          (t): t is AssistTarget => t === "text" || t === "image"
        )
      : [];
    // Dedupe while preserving order.
    const unique = Array.from(new Set(targets));
    if (unique.length === 0) return ["text", "image"];
    return unique;
  } catch (err) {
    // Rate limit: re-throw so the route can choose to fall back to "both"
    // without a classifier rather than trying more Gemini calls on top.
    if (err instanceof GeminiRateLimitError) throw err;
    // Safety block: re-throw so the route surfaces the typed error
    // and the user sees "rewrite your prompt" instead of silently
    // re-firing both downstream Gemini calls that would also block.
    if (err instanceof GeminiSafetyBlockedError) throw err;
    // Parse failures and other transient errors: fall back to the safe
    // default of regenerating both text and image.
    console.error("[gemini] classifyAssistIntent failed:", err);
    return ["text", "image"];
  }
}

// ---------------------------------------------------------------------------
// V2 generation pipeline: script + cast portraits + page art with cast refs
// ---------------------------------------------------------------------------

import type { Character, MemoryReference, Script } from "@/lib/types";
import { parseScript } from "@/lib/script-schema";
import {
  buildAiCastPortraitPrompt,
  buildBackgroundPortraitPrompt,
  buildCastPortraitPrompt,
  buildInferAiCastDescriptionPrompt,
  buildPagePrompt,
  buildScriptPrompt,
  type BuiltPrompt,
} from "@/lib/story-prompt";
import type {
  Occasion,
  RecipientType,
  StoryTone,
} from "@/lib/types";

export interface GenerateScriptArgs {
  recipientType: RecipientType;
  occasion?: Occasion;
  storyTone: StoryTone;
  cast: Character[];
  outline: string;
  memories: MemoryReference[];
  pageCount: number;
  // Names of AI-cast characters that MUST NOT appear in the
  // generated script. Set when re-running Stage 1 after the user
  // removes an AI-cast member at the approval gate.
  excludedAiCharacterNames?: string[];
  // Labels of backgrounds that MUST NOT appear in the generated
  // script. Set when re-running Stage 1 after the user removes a
  // background at the approval gate.
  excludedBackgroundLabels?: string[];
}

export async function generateScript(args: GenerateScriptArgs): Promise<Script> {
  const built: BuiltPrompt = buildScriptPrompt(args);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: built.systemPrompt,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const result = await withTimeout(
    model.generateContent(built.userPrompt),
    GEMINI_TEXT_TIMEOUT_MS,
    "generateScript"
  );
  assertSafeFinish(result, "generateScript");
  const text = result.response.text();
  const parsed = parseJsonResponse(text);
  // Zod-backed parse + cross-field refinements. Refinements live in
  // script-schema.ts: page count, only-allowed memory ids, and every
  // memory id used at least once. Failures surface the same
  // LlmJsonParseError so existing onFailure retry logic keeps working.
  const result2 = parseScript(parsed, {
    expectedPageCount: args.pageCount,
    allowedMemoryIds: args.memories.map((m) => m.id),
  });
  if (!result2.success) {
    throw new LlmJsonParseError(
      `generateScript: ${result2.message}`,
      text
    );
  }
  return result2.data;
}

// Local helper: pull the first inlineData blob from an image response and
// return it as a data: URI. Mirrors the inline pattern used by V1's
// generatePageImage but factored out so cast + page generators share it.
function extractFirstImageDataUri(result: {
  response: {
    candidates?: Array<{
      content?: {
        parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }>;
      };
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

// V2 cast portrait. Returns a base64 data URI; caller uploads via
// uploadGeneratedImage to the uploads bucket.
export async function generateCastPortrait(args: {
  character: Character;
  artStylePromptScaffold: string;
  // Optional one-shot prompt addition the user typed at the
  // approval-gate Regenerate prompt box. NOT persisted on
  // character_portraits — the cached portrait is just the latest
  // upsert. If the user wants the addition to "stick" they can
  // type it again on next regenerate.
  userPromptAddition?: string | null;
}): Promise<string> {
  const prompt = buildCastPortraitPrompt(args);

  const refImages: Array<{ inlineData: { data: string; mimeType: string } }> =
    [];
  for (const url of args.character.reference_photo_urls.slice(0, 5)) {
    const inline = await fetchImageAsInlineData(url);
    if (inline) refImages.push({ inlineData: inline });
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-image-preview",
  });

  const result = await withTimeout(
    model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }, ...refImages],
        },
      ],
      generationConfig: {
        // @ts-expect-error - field not declared in legacy SDK types
        responseModalities: ["IMAGE", "TEXT"],
      },
    }),
    GEMINI_IMAGE_TIMEOUT_MS,
    "generateCastPortrait"
  );
  assertSafeFinish(result, "generateCastPortrait");
  return extractFirstImageDataUri(result);
}

// V2 AI-cast portrait. Generates a portrait for a supporting
// character invented by Stage 1 (no user-supplied reference photo).
// Returns a base64 data URI; caller uploads via uploadGeneratedImage
// to the uploads bucket and persists the URL on story_ai_cast.
export async function generateAiCastPortrait(args: {
  name: string;
  kind: "person" | "pet";
  roleLabel: string | null;
  description: string;
  userPromptAddition: string | null;
  artStylePromptScaffold: string;
}): Promise<string> {
  const prompt = buildAiCastPortraitPrompt(args);

  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-image-preview",
  });

  const result = await withTimeout(
    model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        // @ts-expect-error - field not declared in legacy SDK types
        responseModalities: ["IMAGE", "TEXT"],
      },
    }),
    GEMINI_IMAGE_TIMEOUT_MS,
    "generateAiCastPortrait"
  );
  assertSafeFinish(result, "generateAiCastPortrait");
  return extractFirstImageDataUri(result);
}

// Stage 1.5 helper. Given a script-invented character name plus the
// scene descriptions that mention them, ask a Flash model to infer
// {role, kind, description}. Returns the parsed JSON or null on
// any failure (the pipeline degrades gracefully — a row with a
// generic "person" + bland description is better than failing the
// whole job).
export async function inferAiCastDescription(args: {
  name: string;
  sceneDescriptions: string[];
  recipientType: RecipientType;
  occasion?: Occasion;
}): Promise<{
  role: string;
  kind: "person" | "pet";
  description: string;
} | null> {
  const prompt = buildInferAiCastDescriptionPrompt(args);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  try {
    const result = await withTimeout(
      model.generateContent(prompt),
      GEMINI_TEXT_TIMEOUT_MS,
      "inferAiCastDescription"
    );
    assertSafeFinish(result, "inferAiCastDescription");
    const text = result.response.text();
    const parsed = parseJsonResponse(text) as {
      role?: unknown;
      kind?: unknown;
      description?: unknown;
    };
    if (
      typeof parsed.role !== "string" ||
      (parsed.kind !== "person" && parsed.kind !== "pet") ||
      typeof parsed.description !== "string"
    ) {
      console.error(
        "[gemini] inferAiCastDescription: malformed JSON",
        parsed
      );
      return null;
    }
    return {
      role: parsed.role,
      kind: parsed.kind,
      description: parsed.description,
    };
  } catch (err) {
    if (err instanceof GeminiSafetyBlockedError) throw err;
    console.error("[gemini] inferAiCastDescription failed:", err);
    return null;
  }
}

// V2 background portrait — Stage 2.6 of Spec B. Generates one
// canonical wide-angle illustration per distinct location. No
// reference photo (backgrounds are entirely AI-described). Same
// shape as generateAiCastPortrait but with the background prompt.
export async function generateBackgroundPortrait(args: {
  label: string;
  description: string;
  userPromptAddition: string | null;
  artStylePromptScaffold: string;
}): Promise<string> {
  const prompt = buildBackgroundPortraitPrompt(args);

  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-image-preview",
  });

  const result = await withTimeout(
    model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        // @ts-expect-error - field not declared in legacy SDK types
        responseModalities: ["IMAGE", "TEXT"],
      },
    }),
    GEMINI_IMAGE_TIMEOUT_MS,
    "generateBackgroundPortrait"
  );
  assertSafeFinish(result, "generateBackgroundPortrait");
  return extractFirstImageDataUri(result);
}

// V2 page image — passes the canonical background portrait (Spec B)
// + cast portraits + memory reference photos that should appear on
// this page. The Gemini parts array is ordered:
//   [text, background?, ...castInline, ...memoryInline]
// The text prompt enumerates each batch in order so the model knows
// which attached image is which. The background goes FIRST so
// "where we are" is read before "who's in it."
export async function generatePageImageWithCastRefs(args: {
  sceneDescription: string;
  artStylePromptScaffold: string;
  castPortraitsOnPage: Array<{ name: string; portraitUrl: string }>;
  memoryRefsOnPage?: Array<{
    caption: string;
    photoUrl: string;
    usage: string;
  }>;
  // Spec B: optional background portrait for this page's setting.
  // When null/undefined the page renders without a canonical
  // background reference (today's behavior).
  backgroundPortrait?: { label: string; portraitUrl: string } | null;
}): Promise<string> {
  const memoryRefs = args.memoryRefsOnPage ?? [];
  const prompt = buildPagePrompt({
    sceneDescription: args.sceneDescription,
    artStylePromptScaffold: args.artStylePromptScaffold,
    characterNamesOnPage: args.castPortraitsOnPage.map((c) => c.name),
    memoryRefsOnPage: memoryRefs.map((m) => ({
      caption: m.caption,
      usage: m.usage,
    })),
    backgroundLabelOnPage: args.backgroundPortrait?.label,
  });

  // Inline image parts in three batches matched to the prompt's
  // enumeration: background first (geography anchor), then cast
  // portraits (character anchors), then memory references. A
  // failure to fetch any single ref is non-fatal — we skip it and
  // continue rather than dropping the whole page.
  const backgroundInline: Array<{
    inlineData: { data: string; mimeType: string };
  }> = [];
  if (args.backgroundPortrait) {
    const inline = await fetchImageAsInlineData(
      args.backgroundPortrait.portraitUrl
    );
    if (inline) backgroundInline.push({ inlineData: inline });
  }
  const castInline: Array<{ inlineData: { data: string; mimeType: string } }> =
    [];
  for (const c of args.castPortraitsOnPage) {
    const inline = await fetchImageAsInlineData(c.portraitUrl);
    if (inline) castInline.push({ inlineData: inline });
  }
  const memoryInline: Array<{
    inlineData: { data: string; mimeType: string };
  }> = [];
  for (const m of memoryRefs) {
    const inline = await fetchImageAsInlineData(m.photoUrl);
    if (inline) memoryInline.push({ inlineData: inline });
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-image-preview",
  });

  const result = await withTimeout(
    model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            ...backgroundInline,
            ...castInline,
            ...memoryInline,
          ],
        },
      ],
      generationConfig: {
        // @ts-expect-error - field not declared in legacy SDK types
        responseModalities: ["IMAGE", "TEXT"],
      },
    }),
    GEMINI_IMAGE_TIMEOUT_MS,
    "generatePageImageWithCastRefs"
  );
  assertSafeFinish(result, "generatePageImageWithCastRefs");
  return extractFirstImageDataUri(result);
}
