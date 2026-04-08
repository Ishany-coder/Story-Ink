import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Entity, EditKind, Panel, StoryPage } from "./types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

interface StoryTextResult {
  title: string;
  pages: { pageNumber: number; text: string }[];
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function entitiesContextBlock(entities: Entity[]): string {
  if (!entities || entities.length === 0) return "";
  const grouped: Record<string, Entity[]> = {};
  for (const e of entities) {
    (grouped[e.type] ||= []).push(e);
  }
  const lines: string[] = [];
  for (const type of ["character", "environment", "object"] as const) {
    const list = grouped[type];
    if (!list) continue;
    lines.push(`${type.toUpperCase()}S:`);
    for (const e of list) {
      lines.push(`- ${e.name}: ${e.description}`);
    }
  }
  return lines.join("\n");
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

  const text = result.response.text();
  return JSON.parse(text) as StoryTextResult;
}

// ---------------------------------------------------------------------------
// Comic mode: structured panel script + multi-panel page image generation.
// Mirrors comicink's pipeline (panels JSON → one rendered page image with
// multiple panels and speech bubbles), but reuses Story-Ink's existing
// entity/sticker reference machinery for character consistency.
// ---------------------------------------------------------------------------

export interface ComicScriptResult {
  title: string;
  pages: { pageNumber: number; panels: Panel[] }[];
}

export async function generateComicScript(
  prompt: string,
  pageCount: number
): Promise<ComicScriptResult> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const result = await model.generateContent(
    `You are a professional comic book writer. Create a detailed page-by-page script for a comic book with exactly ${pageCount} pages.

You MUST follow the user's idea exactly. Each page contains 3-6 panels that move the story forward with clear, sequential beats. Dialogue should be short and natural — only what fits in a speech bubble. If a panel has no dialogue, return an empty string.

Return a JSON object with this exact structure:
{
  "title": "Comic Title",
  "pages": [
    {
      "pageNumber": 1,
      "panels": [
        {
          "panelNumber": 1,
          "description": "Vivid visual description of what we see in this panel — composition, framing, mood.",
          "dialogue": "Character: short line. Or empty string if silent.",
          "action": "What is happening in the scene.",
          "characters": ["Names of characters appearing in this panel"],
          "setting": "Where this panel takes place"
        }
      ]
    }
  ]
}

Keep characters and settings consistent across panels and pages. Use the same character names everywhere.

User's idea: ${prompt}`
  );

  return JSON.parse(result.response.text()) as ComicScriptResult;
}

function panelsToPrompt(panels: Panel[]): string {
  return panels
    .map((p) => {
      const lines = [
        `PANEL ${p.panelNumber}:`,
        `  Setting: ${p.setting}`,
        `  Characters: ${p.characters.join(", ") || "(none)"}`,
        `  Action: ${p.action}`,
        `  Description: ${p.description}`,
      ];
      if (p.dialogue && p.dialogue.trim().length > 0) {
        lines.push(`  Dialogue (in speech bubble): ${p.dialogue}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export async function generateComicPageImage(
  page: { pageNumber: number; panels: Panel[] },
  storyTitle: string,
  entities: Entity[] = [],
  references: EntityReference[] = []
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({
      // Higher-fidelity model for multi-panel comic pages. Slower than the
      // 3.1-flash-image used for storybook mode but worth it here because
      // the model has to render multiple coherent panels in one image.
      model: "gemini-3-pro-image-preview",
    });

    const cappedRefs = references.slice(0, 10);

    const intro = [
      `Create a full comic book page for "${storyTitle}" — page ${page.pageNumber}.`,
      `Render a SINGLE image containing multiple comic panels arranged in a dynamic page layout (like a real printed comic book page). Use clear black panel borders with consistent gutters between panels. Sequential storytelling: panels read left-to-right, top-to-bottom.`,
      `Speech bubbles must contain ONLY the dialogue text given for each panel — no character name prefixes, no narration captions, no panel numbers, no labels. If a panel has no dialogue, draw no speech bubble. Letters inside speech bubbles must be clean and legible.`,
      `Panels to render (in order):`,
      panelsToPrompt(page.panels),
      cappedRefs.length > 0
        ? `ABSOLUTE HIGHEST PRIORITY — CHARACTER VISUAL CONSISTENCY: Each named character MUST look EXACTLY like its reference image below — same face, same hair, same outfit, same colors, same proportions. This is non-negotiable across every panel and every page.`
        : entities.length > 0
        ? `Maintain visual consistency with these characters, environments, and objects across all pages:\n${entitiesContextBlock(
            entities
          )}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [{ text: intro }];

    for (const ref of cappedRefs) {
      parts.push({
        text: `Reference for ${ref.name} (${ref.type}): ${ref.description}`,
      });
      parts.push({
        inlineData: { mimeType: ref.mime, data: ref.base64 },
      });
    }

    parts.push({
      text: `Style: modern comic book illustration, bold ink linework, vibrant flat colors with cel shading, dramatic lighting, expressive character poses. Keep the same art style on every page of this comic. The output must be a complete multi-panel comic page — not a single illustration.`,
    });

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

    console.error(
      "[gemini] comic page response had no inlineData. parts:",
      JSON.stringify(respParts, null, 2)
    );
    return generatePlaceholder(`page ${page.pageNumber}`);
  } catch (err) {
    console.error("[gemini] comic page generation failed:", err);
    return generatePlaceholder(`page ${page.pageNumber}`);
  }
}

export interface EntityReference {
  name: string;
  type: Entity["type"];
  description: string;
  mime: string;
  base64: string;
}

export async function generatePageImage(
  pageText: string,
  storyTitle: string,
  entities: Entity[] = [],
  references: EntityReference[] = []
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({
      // Gemini 3.1 Flash Image — current fast image generation model.
      // Alternatives on this API key: "gemini-2.5-flash-image",
      // "gemini-3-pro-image-preview" (higher quality, slower).
      model: "gemini-3.1-flash-image-preview",
    });

    // Build the parts array. When reference images are provided, interleave
    // them with labels so the model knows what each one represents and uses
    // them for visual consistency. Cap at 10 references to stay under the
    // model's input image limit comfortably.
    const cappedRefs = references.slice(0, 10);

    const intro = [
      `Create a beautiful children's storybook illustration for one page of the story titled "${storyTitle}".`,
      `CRITICAL: The output image must contain ZERO text, ZERO letters, ZERO words, ZERO captions, ZERO writing of any kind. This is an illustration only — narration is shown separately under the image.`,
      `Scene to illustrate: ${pageText}`,
      cappedRefs.length > 0
        ? `Use the following reference images for visual consistency. Each character, environment, and object that appears in the scene MUST match the appearance of its reference image exactly — same colors, same shapes, same details.`
        : entities.length > 0
        ? `Maintain visual consistency with these characters, environments, and objects across all pages of the story:\n${entitiesContextBlock(
            entities
          )}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [{ text: intro }];

    for (const ref of cappedRefs) {
      parts.push({
        text: `Reference for ${ref.name} (${ref.type}): ${ref.description}`,
      });
      parts.push({
        inlineData: { mimeType: ref.mime, data: ref.base64 },
      });
    }

    parts.push({
      text: `Now compose these subjects into the scene described above. Style: watercolor children's book illustration, whimsical, warm colors. REMINDER: absolutely NO text, letters, words, captions, signs, or writing anywhere in the image.`,
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
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

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}

// ---------------------------------------------------------------------------
// AI Studio helpers: entity extraction, edit classification, rewrites
// ---------------------------------------------------------------------------

function jsonModel() {
  return genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { responseMimeType: "application/json" },
  });
}

function pagesToScript(pages: { pageNumber: number; text: string }[]): string {
  return pages.map((p) => `Page ${p.pageNumber}: ${p.text}`).join("\n");
}

export async function extractEntities(
  title: string,
  pages: { pageNumber: number; text: string }[]
): Promise<Entity[]> {
  const result = await jsonModel().generateContent(
    `You analyze a children's storybook and extract every distinct character, environment (location/setting), and notable object that appears.

For each entity, write a vivid 1-2 sentence description that captures both how it LOOKS (physical appearance, colors, shapes) and how it BEHAVES or what role it plays. The description must be detailed enough that an illustrator could draw it consistently across many pages.

Return JSON with this exact shape:
{
  "entities": [
    { "name": "Luna", "type": "character", "description": "A small purple cat with bright green eyes and a tiny silver bell on her collar; curious and brave." },
    { "name": "The Mossy Forest", "type": "environment", "description": "A dense forest with towering ancient oaks, glowing mushrooms, and shafts of golden light filtering through emerald leaves." }
  ]
}

"type" must be exactly one of: "character", "environment", "object".

Only include entities that meaningfully appear in the story. Don't include generic background elements.

Story title: ${title}

Story:
${pagesToScript(pages)}`
  );

  const parsed = JSON.parse(result.response.text()) as {
    entities: { name: string; type: string; description: string }[];
  };

  return parsed.entities
    .filter((e) =>
      ["character", "environment", "object"].includes(e.type)
    )
    .map((e) => ({
      id: slugify(e.name),
      name: e.name,
      type: e.type as Entity["type"],
      description: e.description,
    }));
}

export async function classifyEdit(
  entity: Entity,
  instruction: string
): Promise<EditKind> {
  const result = await jsonModel().generateContent(
    `Classify a user's edit request to a storybook entity as either "appearance" or "personality".

- "appearance": purely visual/physical changes (color, size, clothing, material, shape, texture, lighting). The story's plot and the entity's behavior do NOT change. Only images need regenerating.
- "personality": behavior, mood, temperament, role in the story, relationships, or anything that would change how the character ACTS or how the plot unfolds. The whole story text needs rewriting.

If the request mixes both, choose "personality" (the safer/larger rewrite).

Return JSON: { "kind": "appearance" } or { "kind": "personality" }

Entity name: ${entity.name}
Entity type: ${entity.type}
Current description: ${entity.description}

User's edit request: ${instruction}`
  );

  const parsed = JSON.parse(result.response.text()) as { kind: string };
  return parsed.kind === "personality" ? "personality" : "appearance";
}

export async function rewriteEntityDescription(
  entity: Entity,
  instruction: string
): Promise<string> {
  const result = await jsonModel().generateContent(
    `Rewrite a storybook entity's description to incorporate a user's change. Keep the same length and style (1-2 vivid sentences). Preserve everything the user did NOT ask to change.

Return JSON: { "description": "..." }

Entity name: ${entity.name}
Entity type: ${entity.type}
Current description: ${entity.description}

Change to apply: ${instruction}`
  );

  const parsed = JSON.parse(result.response.text()) as { description: string };
  return parsed.description;
}

export interface StickerBytes {
  mime: string;
  base64: string;
}

export async function generateEntityStickerBytes(
  entity: Entity
): Promise<StickerBytes> {
  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-image-preview",
  });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              `Create a single isolated illustration of "${entity.name}" — a ${entity.type} from a children's storybook.`,
              `Description: ${entity.description}`,
              `IMPORTANT: The subject must be CENTERED on a SOLID PURE WHITE background (#FFFFFF). No scenery, no other characters, no props, no shadows extending beyond the subject, no border, no text.`,
              `Style: watercolor children's book illustration, warm colors, clean edges. Show the full ${entity.type} from a clear angle.`,
            ].join("\n\n"),
          },
        ],
      },
    ],
    generationConfig: {
      // @ts-expect-error - field not declared in legacy SDK types
      responseModalities: ["IMAGE", "TEXT"],
    },
  });

  const parts = result.response.candidates?.[0]?.content?.parts;
  if (parts) {
    for (const part of parts) {
      if (part.inlineData?.data && part.inlineData.mimeType) {
        return {
          mime: part.inlineData.mimeType,
          base64: part.inlineData.data,
        };
      }
    }
  }

  throw new Error("Sticker generation returned no image");
}

// Convenience wrapper used by routes that just want a data: URL.
export async function generateEntitySticker(entity: Entity): Promise<string> {
  const { mime, base64 } = await generateEntityStickerBytes(entity);
  return `data:${mime};base64,${base64}`;
}

// Image-to-image: extract one entity from a page image, preserving its
// exact appearance (pose, colors, details). Output has a plain white
// background — the client chroma-keys it to transparent.
export async function extractEntityFromImage(
  pageImage: { mime: string; base64: string },
  entity: Entity
): Promise<StickerBytes> {
  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-image-preview",
  });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              `Look at this children's storybook illustration and isolate just one subject from it.`,
              `Subject to extract: "${entity.name}" (${entity.type}).`,
              `Reference description: ${entity.description}`,
              `OUTPUT: a new image showing ONLY "${entity.name}", in the EXACT same pose, colors, and appearance as in the source image. Do NOT redraw or reinterpret — preserve every visible detail.`,
              `Background: SOLID PURE WHITE (#FFFFFF). No scenery, no other characters, no props, no text, no border.`,
            ].join("\n\n"),
          },
          {
            inlineData: {
              mimeType: pageImage.mime,
              data: pageImage.base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      // @ts-expect-error - field not declared in legacy SDK types
      responseModalities: ["IMAGE", "TEXT"],
    },
  });

  const parts = result.response.candidates?.[0]?.content?.parts;
  if (parts) {
    for (const part of parts) {
      if (part.inlineData?.data && part.inlineData.mimeType) {
        return {
          mime: part.inlineData.mimeType,
          base64: part.inlineData.data,
        };
      }
    }
  }
  throw new Error("extractEntityFromImage: no image in response");
}

// Image-to-image: remove one entity from a page image and inpaint over
// where it was, so the rest of the scene looks intact.
export async function removeEntityFromImage(
  pageImage: { mime: string; base64: string },
  entity: Entity
): Promise<StickerBytes> {
  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-image-preview",
  });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              `Look at this children's storybook illustration and remove one subject from it.`,
              `Subject to remove: "${entity.name}" (${entity.type}).`,
              `Reference description: ${entity.description}`,
              `OUTPUT: the same scene with "${entity.name}" completely gone. Paint over the area where they were, using the surrounding background, scenery, and other elements so it looks natural and complete — like they were never there.`,
              `Keep EVERYTHING else identical: other characters, environment, lighting, color palette, and watercolor style. Do not redraw or reinterpret unrelated parts of the image.`,
              `No text in the output image.`,
            ].join("\n\n"),
          },
          {
            inlineData: {
              mimeType: pageImage.mime,
              data: pageImage.base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      // @ts-expect-error - field not declared in legacy SDK types
      responseModalities: ["IMAGE", "TEXT"],
    },
  });

  const parts = result.response.candidates?.[0]?.content?.parts;
  if (parts) {
    for (const part of parts) {
      if (part.inlineData?.data && part.inlineData.mimeType) {
        return {
          mime: part.inlineData.mimeType,
          base64: part.inlineData.data,
        };
      }
    }
  }
  throw new Error("removeEntityFromImage: no image in response");
}

export async function rewriteStory(
  originalPrompt: string,
  currentTitle: string,
  currentPages: StoryPage[],
  entity: Entity,
  instruction: string
): Promise<StoryTextResult> {
  const pageCount = currentPages.length;
  const result = await jsonModel().generateContent(
    `You are revising an existing children's storybook. Apply the user's change to the character/entity below, propagating it through the entire story so plot and dialogue make sense with the new behavior.

Keep the story's core premise and the same number of pages (${pageCount}). Keep the title unless the change makes it nonsensical. Preserve other characters and environments unchanged.

Return JSON with this exact structure:
{
  "title": "Story Title",
  "pages": [
    { "pageNumber": 1, "text": "..." }
  ]
}

Each page should be 2-4 vivid, whimsical sentences suitable for illustration.

Original user prompt: ${originalPrompt}

Current title: ${currentTitle}

Current story:
${pagesToScript(currentPages)}

Entity being changed: ${entity.name} (${entity.type})
Current description: ${entity.description}
Change to apply: ${instruction}`
  );

  return JSON.parse(result.response.text()) as StoryTextResult;
}

