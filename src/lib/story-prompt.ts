// V2 prompt builder. Takes the structured wizard payload + cast and
// produces (a) the system prompt that frames the script generator and
// (b) the user-facing prompt slot. Replaces pet-prompt.ts. Memorial
// guardrails are gated by occasion === "memorial" and adapt their
// language for person vs. pet kinds.

import type {
  Character,
  MemoryReference,
  Occasion,
  RecipientType,
  StoryTone,
} from "@/lib/types";

interface BuildPromptArgs {
  recipientType: RecipientType;
  occasion?: Occasion;
  storyTone: StoryTone;
  cast: Character[];
  outline: string;
  // Reference photos uploaded in the wizard. The script MUST use every
  // entry in at least one page's `memoryReferences`. The model never
  // sees the photo URLs in the script-stage prompt (image generation
  // stage attaches them inline); it only sees ids + captions so it can
  // plan where each photo belongs.
  memories: MemoryReference[];
  pageCount: number;
  // Names of AI-cast characters to ban from the script. Used when
  // the user removes an AI-cast member at the approval gate and we
  // re-run Stage 1 — the new script must not re-introduce them.
  excludedAiCharacterNames?: string[];
  // Labels of backgrounds to ban from the script. Used when the
  // user removes a background at the approval gate and we re-run
  // Stage 1 — the new script must not re-introduce them.
  excludedBackgroundLabels?: string[];
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

function occasionFrame(occasion: Occasion | undefined, hasPetOnly: boolean): string {
  if (!occasion) return "Tone is warm and personal.";
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
    case "achievement":
      return "Tone is celebratory and admiring — honor the accomplishment without being preachy.";
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

  // Memory rules switch on whether the user uploaded anything — when the
  // memories array is empty we don't want to confuse the model with a
  // schema field they shouldn't populate. When it's non-empty, we lean
  // hard on "every photo must appear" since the downstream Zod schema
  // will reject scripts that drop a memoryId.
  const memoryRules = args.memories.length
    ? `
You will receive a list of REFERENCE PHOTOS below, each anchored by an id and described by a caption. The user uploaded these because they want the artwork to reflect specific people, places, or objects from their life. You MUST:
- Reference every photo in at least one page's "memoryReferences" array (never silently drop a photo).
- For each entry in "memoryReferences", set "usage" to a concrete illustrator instruction that names what to take from the photo and how to combine it with the cast portraits attached to the same page (e.g. "Use the kitchen and red apron from this photo as the setting; place Maya at the counter wearing the apron"). Be specific about setting, objects, clothing, lighting, or pose — whatever the photo actually shows.
- Only reference memoryIds from the provided list. Never invent new ids.
- A page may use zero, one, or multiple photos. Group photos on the same page only when their combination makes narrative sense.
`.trim()
    : "No reference photos were provided — leave each page's \"memoryReferences\" array empty.";

  const system = `
You write personalized illustrated storybooks. The book is for ${recipientLabel(
    args.recipientType
  )}.

${occasionFrame(args.occasion, hasPetOnly)}

${toneInstruction(args.storyTone)}

Cast (these are the only characters that may appear; use their names verbatim and reference them by id when filling characterIds):
${castSummary(args.cast)}

${memoryRules}

Output a single JSON object with this shape:
{
  "title": string,
  "dedication": string,                     // 1–2 sentences, optional but preferred
  "pages": [
    {
      "pageNumber": number,                  // 1..N
      "text": string,                        // the page's narrative text
      "sceneDescription": string,            // a vivid description of what is happening, the setting, and which characters are visible — used as input to image generation
      "characterIds": string[],              // ids (verbatim from the cast above) of cast members visible on this page
      "setting": string,                     // short label of the location this page is set in (e.g. "the park"); MUST match exactly one entry in the top-level "backgrounds" array. Use empty string for setting-less pages (e.g. an abstract dedication page).
      "memoryReferences": [                  // photos to apply to THIS page; [] if none
        {
          "memoryId": string,                // verbatim id from the reference photo list
          "usage": string                    // illustrator instruction for how to combine the photo with cast portraits on this page
        }
      ]
    }
  ],
  "backgrounds": [                            // canonical list of distinct locations
    {
      "label": string,                       // short, reusable location name (1–4 words, e.g. "the park", "Sarah's kitchen")
      "description": string                  // a paragraph describing the location's STABLE physical features — geography, landmarks, structures, palette, general mood. Do NOT describe scene-specific details like characters on the page, per-page lighting, or weather; those vary per page.
    }
  ]
}

Constraints:
- Exactly ${args.pageCount} pages.
- Every character that appears in a sceneDescription must be listed in characterIds.
- The cast above is the user-provided roster. Reference user-cast characters by their UUID (verbatim from the "id=" prefix in the cast list). If the story genuinely needs additional supporting characters (parents at a wedding, the priest, the child's best friend, the antagonist), invent them with a clear simple name (e.g. "Sarah", "Mr. Patel", "the bride's father") and reference them in characterIds using that exact name (not a UUID). In the first sceneDescription that mentions an invented character, give a specific, consistent visual description (age range, build, hair, distinctive features) so a portrait can be generated.
- Output ALL characters that appear on any page in characterIds, whether they were in the user-provided cast (use UUIDs) or invented for the story (use names). Don't pad: only invent characters that actually appear in at least one scene.${args.excludedAiCharacterNames && args.excludedAiCharacterNames.length > 0 ? `\n- DO NOT include the following character names in any page or characterIds. Rewrite scenes that would otherwise need them: ${args.excludedAiCharacterNames.map((n) => `"${n}"`).join(", ")}.` : ""}
- Group pages by location. Define each distinct location ONCE in the top-level "backgrounds" array (typical story: 2–5 backgrounds total), then reference it by exact label in each page's "setting" field. Don't invent a new background for the same place seen at different times of day or different camera angles — that's a per-page variation handled in sceneDescription, not a new location.
- Backgrounds[].description must describe ONLY stable physical features (geography, landmarks, structures, palette). Don't put characters, per-page lighting, weather, or moment-in-time details in the background description.${args.excludedBackgroundLabels && args.excludedBackgroundLabels.length > 0 ? `\n- DO NOT include the following background labels in any page or backgrounds[]. Rewrite scenes that would otherwise be set there: ${args.excludedBackgroundLabels.map((n) => `"${n}"`).join(", ")}.` : ""}
- Each page is self-contained but contributes to a continuous arc.
`.trim();

  const memoriesBlock = args.memories.length
    ? `Reference photos (use every one in at least one page's memoryReferences):\n${args.memories
        .map((m) => `- id: ${m.id} | caption: ${m.caption}`)
        .join("\n")}`
    : null;

  const user = [
    args.outline?.trim() ? `Story outline:\n${args.outline.trim()}` : null,
    memoriesBlock,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { systemPrompt: system, userPrompt: user || "(no additional notes)" };
}

// Per-character portrait prompt. Used by Stage 2 (generateCastPortrait).
// The attached reference photo is treated as a LIKENESS anchor, not as
// a vibe reference. Earlier versions of this prompt just said
// "generate a portrait of {name}" and let the model invent fairy
// godmothers from the traits text; the explicit feature-by-feature
// instruction below is what forces the model to actually look at the
// photo and reproduce the person/pet faithfully.
export function buildCastPortraitPrompt(args: {
  character: Character;
  artStylePromptScaffold: string;
  // Optional one-shot prompt addition from the user via the
  // approval-gate Regenerate prompt box. Applied as a "tweak"
  // layered on top of the photo-anchored likeness — typical use:
  // wardrobe / pose / mood adjustments ("wearing a winter coat",
  // "happier expression"). The photo remains the source of truth
  // for facial / body features; we tell the model that explicitly
  // below so the addition doesn't override the likeness.
  userPromptAddition?: string | null;
}): string {
  const { character, artStylePromptScaffold, userPromptAddition } = args;
  const isPet = character.kind === "pet";
  const subjectNoun = isPet
    ? `a real pet (${character.species ?? "pet"})`
    : "a real person";
  const role = character.role_label
    ? `Their role in the story is "${character.role_label}".`
    : "";
  // Traits inform expression and posture only — never appearance. The
  // model has gotten confused before and rendered traits like "warm
  // grandma" as a literal stylized archetype.
  const traits = character.traits
    ? `Personality (use only for expression and posture, NOT appearance): ${character.traits}.`
    : "";

  // User's optional regenerate-time prompt addition. Bound to the
  // expression / wardrobe / pose layer — explicitly NOT allowed to
  // override the photo-anchored likeness.
  const userAddition =
    userPromptAddition && userPromptAddition.trim().length > 0
      ? `\n\nAdditional adjustments from the user (apply these to wardrobe, pose, expression, mood, or surrounding details — NOT to facial or body features, which must continue to match the attached photo): ${userPromptAddition.trim()}`
      : "";

  // Feature-by-feature likeness checklist. Different list for people
  // vs pets so the model has the right vocabulary to anchor on.
  const likenessFeatures = isPet
    ? "breed, coat color and pattern, coat length, markings, body type and size, ear shape and carriage, eye color, and any distinguishing features (collar, scars, missing limbs, etc.) — only if they appear in the photo"
    : "face shape, eye shape and color, hair color and style, skin tone, apparent age, body type, and any distinguishing features (glasses, freckles, facial hair, scars, etc.) — only if they appear in the photo";

  return `
Generate a portrait of ${subjectNoun}: ${character.name}.

The attached image is a photograph of ${character.name}. Your portrait MUST faithfully match the ${isPet ? "pet" : "person"} in that photo. Reproduce their ${likenessFeatures}. This is a LIKENESS reference, not a vibe reference. Do not stylize away their real features. Do not add costumes, accessories, wings, halos, hats, magical elements, or any other adornments that are not present in the photo. Do not change their age, gender, or species.

${role}

${traits}${userAddition}

Render in this illustrated style:
${artStylePromptScaffold}

Framing: ${isPet ? "head-and-shoulders or full-body, whichever best shows the pet's distinguishing features" : "head-and-shoulders, centered, looking toward camera"}. Plain neutral background. Well-lit. No text, captions, or watermarks in the image.

This portrait will be used as the visual anchor for ${character.name} on every page of an illustrated storybook, so the likeness must stay consistent across pages.
`.trim();
}

// Portrait prompt for AI-invented supporting characters (no user-
// supplied reference photo). Drives Stage 2 portrait generation for
// every row in story_ai_cast. The script-derived `description`
// supplies the feature-level likeness anchor; the optional
// `userPromptAddition` is appended verbatim when the user types
// adjustments via the approval-gate pencil icon ("older, with grey
// hair", etc.).
export function buildAiCastPortraitPrompt(args: {
  name: string;
  kind: "person" | "pet";
  roleLabel: string | null;
  description: string;
  userPromptAddition: string | null;
  artStylePromptScaffold: string;
}): string {
  const { name, kind, roleLabel, description, userPromptAddition, artStylePromptScaffold } = args;
  const isPet = kind === "pet";
  const subjectNoun = isPet ? "a pet" : "a person";
  const role = roleLabel ? `Role in the story: ${roleLabel}.` : "";
  const userAddition = userPromptAddition && userPromptAddition.trim().length > 0
    ? `\n\nAdditional adjustments from the user (apply these on top of the description above): ${userPromptAddition.trim()}`
    : "";

  return `
Generate a portrait of ${subjectNoun}: ${name}.

This is a supporting character invented for an illustrated storybook (no reference photo). Render them based on this likeness specification:

${description}${userAddition}

${role}

Render in this illustrated style:
${artStylePromptScaffold}

Framing: ${isPet ? "head-and-shoulders or full-body, whichever best shows the pet's distinguishing features" : "head-and-shoulders, centered, looking toward camera"}. Plain neutral background. Well-lit. No text, captions, or watermarks in the image.

This portrait will be used as the visual anchor for ${name} on every page of the storybook, so the likeness must stay consistent across pages.
`.trim();
}

// Prompt for the Stage 1.5 Flash call that infers an AI cast
// member's role + kind + appearance description from the script.
// Input: the invented character's name + all sceneDescriptions
// where the name appears + a tiny bit of story context. Output:
// JSON the caller validates and inserts into story_ai_cast.
export function buildInferAiCastDescriptionPrompt(args: {
  name: string;
  sceneDescriptions: string[];
  recipientType: RecipientType;
  occasion?: Occasion;
}): string {
  const scenes = args.sceneDescriptions
    .map((s, i) => `  ${i + 1}. ${s}`)
    .join("\n");

  return `
You analyze a single character mentioned in an illustrated storybook script and infer their likeness for a portrait generator.

Character name (verbatim from the script): ${args.name}
Book is for: ${recipientLabel(args.recipientType)}
Occasion: ${args.occasion ?? "general"}

Every scene in the script that mentions this character:
${scenes || "(none — the character is named but never described)"}

Output a single JSON object:
{
  "role": string,           // 1-4 word descriptor of who they are in the story (e.g. "the bride's father", "best friend", "the antagonist", "Sarah's dog")
  "kind": "person" | "pet", // pet only if scenes clearly indicate an animal companion; otherwise person
  "description": string     // a single paragraph of 2-4 sentences. Concrete physical features only (age range, build, hair color/style, skin tone, distinctive features like glasses/beard/scars/collar). Do NOT include personality, mood, clothing-of-the-moment, or scene-specific context — just the stable likeness that should hold across every page they appear in.
}

Rules:
- If the scenes don't describe the character's appearance, invent reasonable features that fit the role (e.g. "the bride's father" → an older man) and commit. Do NOT leave the description vague.
- Never invent features that contradict explicit details in the scenes (if scene says "a young woman with red hair", the description must match).
- Output JSON only, no surrounding prose.
`.trim();
}

// Spec B: portrait prompt for a canonical background — one wide-
// angle establishing illustration per distinct location. Used by
// Stage 2.6. The output gets attached as a visual anchor on every
// Stage 3 page whose `setting` matches `label`.
export function buildBackgroundPortraitPrompt(args: {
  label: string;
  description: string;
  userPromptAddition: string | null;
  artStylePromptScaffold: string;
}): string {
  const { label, description, userPromptAddition, artStylePromptScaffold } = args;
  const userAddition =
    userPromptAddition && userPromptAddition.trim().length > 0
      ? `\n\nAdditional adjustments from the user (apply these on top of the description above): ${userPromptAddition.trim()}`
      : "";

  return `
Generate a wide-angle establishing illustration of: ${label}.

Setting features (use these to render a consistent appearance):

${description}${userAddition}

Render in this illustrated style:
${artStylePromptScaffold}

Wide-angle establishing shot. No characters in the frame. No text, captions, or watermarks in the image.

This illustration will be used as the canonical visual reference for ${label} on every page of an illustrated storybook set in this location, so the geography, landmarks, palette, and overall look must stay consistent across pages.
`.trim();
}

// Per-page prompt for Stage 3. The background portrait + cast
// portraits + memory reference photos are passed as inline image
// inputs alongside this text — the prompt enumerates them in order
// so the model knows which attached image is which.
//
// Image-parts order (Stage 3 caller must match this):
//   [text, background?, ...castPortraits, ...memoryPhotos]
//
// Background = canonical geography anchor (the place must look the
// same on every page set there). Cast portraits = character likeness
// anchors. Memory references = scene-specific source material per
// the per-photo "usage" instruction emitted by Stage 1.
export function buildPagePrompt(args: {
  sceneDescription: string;
  artStylePromptScaffold: string;
  characterNamesOnPage: string[];
  memoryRefsOnPage: Array<{ caption: string; usage: string }>;
  backgroundLabelOnPage?: string;
}): string {
  const backgroundBlock = args.backgroundLabelOnPage
    ? `Background reference attached: "${args.backgroundLabelOnPage}". Use the geography, landmarks, palette, and overall look from this image as the canonical appearance of ${args.backgroundLabelOnPage}. Adapt only the camera angle, time of day, and mood per the scene description — do not re-imagine the location itself.`
    : "";

  const characterRefList =
    args.characterNamesOnPage.length > 0
      ? `Cast portraits attached after the background (in order): ${args.characterNamesOnPage.join(
          ", "
        )}. The faces, features, and overall appearance of these characters must match the attached portraits exactly.`
      : "";

  const memoryRefList =
    args.memoryRefsOnPage.length > 0
      ? `Reference photos attached after the cast portraits (in order):\n${args.memoryRefsOnPage
          .map(
            (m, i) =>
              `  ${i + 1}. caption: "${m.caption}" — usage: ${m.usage}`
          )
          .join(
            "\n"
          )}\nApply each reference photo's usage instruction faithfully while keeping the cast looking like their portraits. Treat the reference photos as source material for setting, objects, clothing, lighting, and props — re-render them in the story's illustrated style; do not paste them in photographically.`
      : "";

  return `
${args.artStylePromptScaffold}

Scene: ${args.sceneDescription}

${backgroundBlock}

${characterRefList}

${memoryRefList}

Storybook illustration of the scene. Do not include any text, captions, or watermarks in the image.
`.trim();
}
