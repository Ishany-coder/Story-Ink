import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export interface StoryTextResult {
  title: string;
  pages: { pageNumber: number; text: string }[];
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

  const result = await model.generateContent(
    `You are a children's storybook author. Given the user's idea, write a storybook with exactly ${pageCount} pages.

Return a JSON object with this exact structure:
{
  "title": "Story Title",
  "pages": [
    { "pageNumber": 1, "text": "Page 1 story text (2-4 vivid, whimsical sentences suitable for illustration)..." }
  ]
}

Make the story whimsical, engaging, and rich with visual imagery. Each page should paint a clear scene.

User's idea: ${prompt}`
  );

  return JSON.parse(result.response.text()) as StoryTextResult;
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

  const result = await model.generateContent(
    `You are revising one page of a children's storybook titled "${storyTitle}". Rewrite only page ${targetPageNumber} in a fresh way — a different turn of phrase, a new sensory detail — while keeping the plot beat, characters, and tone consistent with the surrounding pages. Keep it to 2-4 whimsical sentences suitable for illustration.

Return JSON: { "text": "..." }

Story so far:
${context}`
  );

  const parsed = JSON.parse(result.response.text()) as { text: string };
  return parsed.text;
}

export async function generatePageImage(
  pageText: string,
  storyTitle: string
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({
      // Gemini 3.1 Flash Image — current fast image generation model.
      model: "gemini-3.1-flash-image-preview",
    });

    const intro = [
      `Create a beautiful children's storybook illustration for one page of the story titled "${storyTitle}".`,
      `CRITICAL: The output image must contain ZERO text, ZERO letters, ZERO words, ZERO captions, ZERO writing of any kind. This is an illustration only — narration is overlaid separately.`,
      `Scene to illustrate: ${pageText}`,
      `Style: watercolor children's book illustration, whimsical, warm colors. REMINDER: absolutely NO text, letters, words, captions, signs, or writing anywhere in the image.`,
    ].join("\n\n");

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: intro }] }],
      generationConfig: {
        // responseModalities isn't in @google/generative-ai@0.24.1's types,
        // but the SDK forwards unknown generationConfig fields to the API.
        // @ts-expect-error - field not declared in legacy SDK types
        responseModalities: ["IMAGE", "TEXT"],
      },
    });

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
// the URL is empty/invalid/CORS-blocked — the caller will proceed without
// the visual context rather than failing outright.
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
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const mimeType = res.headers.get("content-type") ?? "image/png";
    return { mimeType, data: Buffer.from(buf).toString("base64") };
  } catch (err) {
    console.error("[gemini] failed to fetch current image for context:", err);
    return null;
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
    () => model.generateContent({ contents: [{ role: "user", parts }] }),
    { label: "assistRegenerateText" }
  );

  const parsed = JSON.parse(result.response.text()) as { text: string };
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
      model.generateContent({
        contents: [{ role: "user", parts }],
        generationConfig: {
          // @ts-expect-error - field not declared in legacy SDK types
          responseModalities: ["IMAGE", "TEXT"],
        },
      }),
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
      () => model.generateContent({ contents: [{ role: "user", parts }] }),
      { label: "classifyAssistIntent" }
    );
    const raw = result.response.text();
    const parsed = JSON.parse(raw) as { targets?: unknown };
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
