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
      return `- id=${c.id} | ${c.name}${speciesNote}${role}${traits}`;
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
    case "child":
      return "your child";
    case "baby":
      return "your baby";
    case "partner":
      return "your romantic partner";
    case "parent":
      return "your mom or dad";
    case "niece_nephew":
      return "your niece or nephew";
    case "sibling":
      return "your sibling";
    case "friend":
      return "your friend";
    case "grandparent":
      return "your grandparent";
    case "pet":
      return "your pet";
    case "aunt":
      return "your aunt";
    case "uncle":
      return "your uncle";
    case "cousin":
      return "your cousin";
    case "family":
      return "your family";
    case "self":
      return "yourself";
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
  const hasPetOnly = args.cast.length > 0 && args.cast.every((c) => c.kind === "pet");

  const system = `
You write personalized illustrated storybooks. The book is for ${recipientLabel(
    args.recipientType
  )}.

${occasionFrame(args.occasion, hasPetOnly)}

${toneInstruction(args.storyTone)}

Cast (these are the only characters that may appear; use their names verbatim and reference them by id when filling characterIds):
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
      "characterIds": string[]               // ids (verbatim from the cast above) of cast members visible on this page
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
