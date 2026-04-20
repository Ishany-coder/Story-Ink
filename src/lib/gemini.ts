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
    text: `${buildAssistantPreamble(args.systemPrompt)}You are revising one page of a children's storybook titled "${args.storyTitle}". The original idea behind the story was: "${args.storyPrompt}". Rewrite only page ${args.targetPageNumber} according to the user's request below, while keeping the plot beat, characters, and tone consistent with the surrounding pages. Keep it to 2-4 whimsical sentences suitable for illustration. If a current illustration is attached, make sure the rewritten text matches what's actually drawn.

User's request for page ${args.targetPageNumber}: ${args.userPrompt}

Return JSON: { "text": "..." }

Story so far:
${context}`,
  };

  const imageInline = await fetchImageAsInlineData(args.currentImageUrl);
  const parts = imageInline
    ? [{ inlineData: imageInline }, textPart]
    : [textPart];

  const result = await model.generateContent({
    contents: [{ role: "user", parts }],
  });

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

  const result = await model.generateContent({
    contents: [{ role: "user", parts }],
    generationConfig: {
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

  throw new Error("Gemini returned no image data");
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
