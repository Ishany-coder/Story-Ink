import { GoogleGenerativeAI } from "@google/generative-ai";
import { fetchWithTimeout, isAllowedContentUrl, withTimeout } from "@/lib/http";

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

export interface StoryTextResult {
  title: string;
  pages: { pageNumber: number; text: string }[];
}

function isStoryTextResult(v: unknown, pageCount: number): v is StoryTextResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.title !== "string" || !o.title.trim()) return false;
  if (!Array.isArray(o.pages) || o.pages.length !== pageCount) return false;
  for (let i = 0; i < o.pages.length; i++) {
    const p = o.pages[i] as Record<string, unknown> | undefined;
    if (!p || typeof p !== "object") return false;
    if (typeof p.pageNumber !== "number") return false;
    if (typeof p.text !== "string" || !p.text.trim()) return false;
  }
  return true;
}

export async function generateStoryText(
  prompt: string,
  pageCount: number
): Promise<StoryTextResult> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const buildPrompt = (reprompt: boolean) =>
    `You are a children's storybook author. Given the user's idea, write a storybook with exactly ${pageCount} pages.

Return a JSON object with this exact structure:
{
  "title": "Story Title",
  "pages": [
    { "pageNumber": 1, "text": "Page 1 story text (2-4 vivid, whimsical sentences suitable for illustration)..." }
  ]
}

Make the story whimsical, engaging, and rich with visual imagery. Each page should paint a clear scene.

${
  reprompt
    ? "IMPORTANT: your previous response was not valid JSON. Respond with ONLY the raw JSON object — no code fences, no prose, no markdown. Start with { and end with }. "
    : ""
}User's idea: ${prompt}`;

  const generate = async (reprompt: boolean) =>
    withGeminiRetry(
      () =>
        withTimeout(
          model.generateContent(buildPrompt(reprompt)),
          GEMINI_TEXT_TIMEOUT_MS,
          "generateStoryText"
        ),
      { label: "generateStoryText" }
    );

  // One retry on malformed JSON with an explicit "respond with bare JSON"
  // reprompt. If the second pass also fails, bubble up so the Inngest
  // function marks the job failed and the user gets a real error rather
  // than a silently-broken story.
  let raw: string;
  let parsed: unknown;
  try {
    const res = await generate(false);
    raw = res.response.text();
    parsed = parseJsonResponse(raw);
  } catch (err) {
    if (!(err instanceof LlmJsonParseError)) throw err;
    console.warn(
      "[gemini] generateStoryText returned non-JSON, reprompting. head:",
      err.raw.slice(0, 200)
    );
    const res = await generate(true);
    raw = res.response.text();
    parsed = parseJsonResponse(raw);
  }

  if (!isStoryTextResult(parsed, pageCount)) {
    console.error(
      "[gemini] generateStoryText schema mismatch. parsed:",
      JSON.stringify(parsed)?.slice(0, 400)
    );
    throw new Error(
      `Gemini returned a story in an unexpected shape (expected ${pageCount} pages).`
    );
  }
  return parsed;
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
    () =>
      withTimeout(
        model.generateContent(
          `You are revising one page of a children's storybook titled "${storyTitle}". Rewrite only page ${targetPageNumber} in a fresh way — a different turn of phrase, a new sensory detail — while keeping the plot beat, characters, and tone consistent with the surrounding pages. Keep it to 2-4 whimsical sentences suitable for illustration.

Return JSON: { "text": "..." }

Story so far:
${context}`
        ),
        GEMINI_TEXT_TIMEOUT_MS,
        "regeneratePageText"
      ),
    { label: "regeneratePageText" }
  );

  const parsed = parseJsonResponse(result.response.text()) as { text?: unknown };
  if (typeof parsed.text !== "string" || !parsed.text.trim()) {
    throw new Error("Gemini regen-text response missing text field");
  }
  return parsed.text;
}

// Reference photos for visual grounding. Used by pet stories so the
// pet in every illustrated page actually looks like the user's pet.
// `previousPageUrl` is passed in Quality mode to anchor cross-page
// consistency (the previous page's generated illustration is shown
// to the model as "keep this character/scene style").
export interface PageImageContext {
  // Pet reference photos (Supabase Storage URLs). Up to 10.
  referencePhotos?: string[];
  // The previous page's generated image URL. Quality mode only.
  previousPageUrl?: string | null;
  // Pet description seeded into the prompt so the model knows what
  // it's drawing even when references fail to fetch.
  petDescription?: string | null;
  // Memorial mode softens the visual style.
  memorial?: boolean;
}

export async function generatePageImage(
  pageText: string,
  storyTitle: string,
  context: PageImageContext = {}
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({
      // Gemini 3.1 Flash Image — current fast image generation model.
      model: "gemini-3.1-flash-image-preview",
    });

    const styleNote = context.memorial
      ? "Style: soft watercolor children's book illustration with gentle, nostalgic colors and warm light. Reverent and tender."
      : "Style: watercolor children's book illustration, whimsical, warm colors.";

    const introLines: string[] = [
      `Create a beautiful children's storybook illustration for one page of the story titled "${storyTitle}".`,
      `CRITICAL: The output image must contain ZERO text, ZERO letters, ZERO words, ZERO captions, ZERO writing of any kind. This is an illustration only — narration is overlaid separately.`,
    ];
    if (context.petDescription) {
      introLines.push(
        `The main character is a real pet the user knows: ${context.petDescription}. Reference photos are attached so you can match the pet's actual appearance — likeness matters.`
      );
    }
    if (context.previousPageUrl) {
      introLines.push(
        `The first attached image is the illustration from the PREVIOUS page of this same book — match its art style, color palette, and the pet's appearance exactly. Continuity across pages matters.`
      );
    }
    introLines.push(`Scene to illustrate: ${pageText}`);
    introLines.push(
      `${styleNote} REMINDER: absolutely NO text, letters, words, captions, signs, or writing anywhere in the image.`
    );
    const intro = introLines.join("\n\n");

    // Build the multimodal parts list. Order matters for Gemini —
    // putting reference imagery before the text prompt makes it more
    // likely the model treats them as authoritative grounding.
    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [];

    if (context.previousPageUrl) {
      const prev = await fetchImageAsInlineData(context.previousPageUrl);
      if (prev) parts.push({ inlineData: prev });
    }
    for (const photoUrl of context.referencePhotos ?? []) {
      const inline = await fetchImageAsInlineData(photoUrl);
      if (inline) parts.push({ inlineData: inline });
      // Cap at ~5 images of context to keep the request reasonable —
      // the SDK is fine with more, but token cost climbs fast.
      if (parts.length >= 5) break;
    }

    parts.push({ text: intro });

    const result = await withGeminiRetry(
      () =>
        withTimeout(
          model.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig: {
              // responseModalities isn't in @google/generative-ai@0.24.1's types,
              // but the SDK forwards unknown generationConfig fields to the API.
              // @ts-expect-error - field not declared in legacy SDK types
              responseModalities: ["IMAGE", "TEXT"],
            },
          }),
          GEMINI_IMAGE_TIMEOUT_MS,
          "generatePageImage"
        ),
      { label: "generatePageImage" }
    );

    const respParts = result.response.candidates?.[0]?.content?.parts;
    if (respParts) {
      for (const part of respParts) {
        if (part.inlineData?.data) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }

    console.error(
      "[gemini] image response contained no inlineData. parts:",
      JSON.stringify(respParts, null, 2)
    );
    return generatePlaceholder(pageText);
  } catch (err) {
    console.error("[gemini] image generation failed:", err);
    return generatePlaceholder(pageText);
  }
}

function generatePlaceholder(pageText: string): string {
  const colors = [
    ["#1e3a5f", "#2d5a87"],
    ["#3d1f56", "#5a3478"],
    ["#1f4f3d", "#2d7a5a"],
    ["#5f3a1e", "#875a2d"],
    ["#4a1942", "#6b2d5a"],
  ];
  const [c1, c2] = colors[Math.abs(hashCode(pageText)) % colors.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${c1}"/>
        <stop offset="100%" style="stop-color:${c2}"/>
      </linearGradient>
    </defs>
    <rect width="768" height="768" fill="url(#g)"/>
    <text x="384" y="384" text-anchor="middle" dominant-baseline="middle" font-family="serif" font-size="48" fill="rgba(255,255,255,0.15)">StoryInk</text>
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// ---------------------------------------------------------------------------
// AI Assistant helpers
//
// Used by the Studio's Assistant panel to regenerate a single page's text or
// image from a freeform user prompt. The "system prompt" passed in is
// already the composite of the user's global prompt (localStorage) and the
// story's per-story prompt (stories.ai_system_prompt), concatenated by the
// API route before calling these.
// ---------------------------------------------------------------------------

// Wrap a Gemini call so we automatically retry on HTTP 429 (rate limit) with
// exponential backoff. Free-tier quotas are small and bursty — the Studio's
// /ai/infer route fires up to 3 Gemini calls back-to-back, which can clip the
// per-minute limit even when the user's pace is reasonable. Two retries with
// 2s → 5s backoff recovers from those transient throttles without making the
// user feel the app is slow.
//
// When all retries exhaust, the original 429 is rethrown with a clearer
// message so the route handler can surface "please wait a minute" instead of
// a generic failure.
export class GeminiRateLimitError extends Error {
  constructor(message = "Gemini rate limit hit — try again in a minute.") {
    super(message);
    this.name = "GeminiRateLimitError";
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
  const maxAttempts = opts.maxAttempts ?? 3;
  const delays = [2000, 5000];
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
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
    () =>
      withTimeout(
        model.generateContent({ contents: [{ role: "user", parts }] }),
        GEMINI_TEXT_TIMEOUT_MS,
        "assistRegenerateText"
      ),
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
}

export async function assistRegenerateImage(
  args: AssistRegenerateImageArgs
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-image-preview",
  });

  const imageInline = await fetchImageAsInlineData(args.currentImageUrl);
  const hasCurrent = imageInline !== null;

  const intro = [
    `${buildAssistantPreamble(args.systemPrompt)}${
      hasCurrent
        ? `The attached image is the current illustration for this page. Produce a revised illustration that keeps its overall composition, characters, and style where possible, and applies only the user's requested changes.`
        : `Create a beautiful children's storybook illustration for one page of the story titled "${args.storyTitle}". The original idea behind the story was: "${args.storyPrompt}".`
    }`,
    `CRITICAL: The output image must contain ZERO text, ZERO letters, ZERO words, ZERO captions, ZERO writing of any kind. This is an illustration only — narration is overlaid separately.`,
    `Scene on this page: ${args.pageText}`,
    `The user's specific request for this illustration: ${args.userPrompt}`,
    `Style: watercolor children's book illustration, whimsical, warm colors. REMINDER: absolutely NO text, letters, words, captions, signs, or writing anywhere in the image.`,
  ].join("\n\n");

  const parts = imageInline
    ? [{ inlineData: imageInline }, { text: intro }]
    : [{ text: intro }];

  const result = await withGeminiRetry(
    () =>
      withTimeout(
        model.generateContent({
          contents: [{ role: "user", parts }],
          generationConfig: {
            // @ts-expect-error - field not declared in legacy SDK types
            responseModalities: ["IMAGE", "TEXT"],
          },
        }),
        GEMINI_IMAGE_TIMEOUT_MS,
        "assistRegenerateImage"
      ),
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

DEFAULT OUTPUT: ["text","image"] (both).

Only downgrade to a single target when the instruction is UNAMBIGUOUSLY scoped:

- ["text"] — the request is clearly a wording / tone / length / rhythm / vocabulary / voice rewrite with zero visual implication. Examples: "make it rhyme", "shorter", "more suspenseful", "use simpler words". If the request could ALSO affect the illustration in any way, do NOT downgrade.

- ["image"] — the request is clearly a pure visual tweak that could not plausibly require rewording. Examples: "change the color palette to warmer tones", "add more texture", "make the lighting softer", "less blur". If the request introduces, removes, or changes anything the narration describes (characters, actions, setting, mood, time, weather), do NOT downgrade.

Anything involving a character (name, species, role, appearance change like "Timmy is a cow"), a setting change, a new action, or a plot beat ALWAYS stays as ["text","image"]. Err on the side of ["text","image"] whenever unsure.

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
      () =>
        withTimeout(
          model.generateContent({ contents: [{ role: "user", parts }] }),
          GEMINI_TEXT_TIMEOUT_MS,
          "classifyAssistIntent"
        ),
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
    // Parse failures and other transient errors: fall back to the safe
    // default of regenerating both text and image.
    console.error("[gemini] classifyAssistIntent failed:", err);
    return ["text", "image"];
  }
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}
