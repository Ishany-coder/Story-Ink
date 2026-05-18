import { z } from "zod";

// AI-output schema for the Stage-1 storybook script. Lives in its own
// module so non-AI surfaces don't pay the zod import cost. Inferred
// types are re-exported through `@/lib/types` for compatibility with
// the rest of the codebase.

// How a single reference photo should be used on a specific page. The
// AI emits one entry per photo per page where that photo is meant to
// appear. `usage` is the illustrator-grade instruction that tells the
// image model what to take from the photo (e.g. the setting, an
// object, a piece of clothing) and how to combine it with the
// character portraits also attached to the page.
export const MemoryUsageSchema = z.object({
  memoryId: z.string().min(1),
  usage: z.string().min(1),
});

export const ScriptPageSchema = z.object({
  pageNumber: z.number().int().positive(),
  text: z.string().min(1),
  sceneDescription: z.string().min(1),
  characterIds: z.array(z.string()),
  memoryReferences: z.array(MemoryUsageSchema),
  // Spec B: short location label that matches an entry in the
  // script's top-level `backgrounds[]`. Empty string or missing
  // means "no canonical background" (e.g. dedication page) — Stage
  // 3 then renders without a background visual anchor.
  setting: z.string().optional(),
});

// Spec B: script-emitted background entry. Just label + description
// — the full DB row (story_backgrounds, with portrait_url + user
// prompt addition + timestamps) is `Background` in @/lib/types.
export const ScriptBackgroundSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1),
});

export const ScriptSchema = z.object({
  title: z.string().min(1),
  dedication: z.string().optional(),
  pages: z.array(ScriptPageSchema),
  // Spec B: canonical list of distinct locations in this story.
  // Stage 1.6 validates that every page's `setting` matches one
  // of these `label`s. Optional on the schema level for backward
  // compatibility with pre-Spec-B scripts already persisted in
  // stories.script.
  backgrounds: z.array(ScriptBackgroundSchema).optional(),
});

export type ScriptBackground = z.infer<typeof ScriptBackgroundSchema>;

export type MemoryUsage = z.infer<typeof MemoryUsageSchema>;
export type ScriptPage = z.infer<typeof ScriptPageSchema>;
export type Script = z.infer<typeof ScriptSchema>;

// Refinement context — what the parser needs to enforce beyond the
// shape: the page count from the wizard and the set of memory ids the
// AI was allowed to reference.
export interface ScriptRefinement {
  expectedPageCount: number;
  allowedMemoryIds: string[];
}

export interface ParsedScriptResult {
  success: true;
  data: Script;
}

export interface ParsedScriptError {
  success: false;
  message: string;
}

// Parse + cross-field validate. Returns a discriminated union so call
// sites can render errors back into a single `LlmJsonParseError`.
// Refinement rules (in order):
//   1. exactly `expectedPageCount` pages
//   2. every page's memoryIds come from `allowedMemoryIds`
//   3. every `allowedMemoryId` appears on at least one page (so the AI
//      cannot silently drop a photo the user uploaded)
export function parseScript(
  raw: unknown,
  refinement: ScriptRefinement
): ParsedScriptResult | ParsedScriptError {
  const parsed = ScriptSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, message: parsed.error.message };
  }
  const script = parsed.data;

  if (script.pages.length !== refinement.expectedPageCount) {
    return {
      success: false,
      message: `expected ${refinement.expectedPageCount} pages, got ${script.pages.length}`,
    };
  }

  const allowed = new Set(refinement.allowedMemoryIds);
  const used = new Set<string>();
  for (const page of script.pages) {
    for (const ref of page.memoryReferences) {
      if (!allowed.has(ref.memoryId)) {
        return {
          success: false,
          message: `page ${page.pageNumber} references unknown memoryId "${ref.memoryId}"`,
        };
      }
      used.add(ref.memoryId);
    }
  }
  const missing = refinement.allowedMemoryIds.filter((id) => !used.has(id));
  if (missing.length > 0) {
    return {
      success: false,
      message: `script never uses memory ids: ${missing.join(", ")}`,
    };
  }

  // Spec B: every page's `setting` (when present + non-empty) must
  // match a `backgrounds[].label`. Models that emit a setting
  // string without a matching backgrounds entry would leave Stage
  // 1.6 with no canonical illustration to anchor that page on, so
  // we reject up-front and let the retry logic regenerate.
  if (script.backgrounds && script.backgrounds.length > 0) {
    const labels = new Set(script.backgrounds.map((b) => b.label));
    for (const page of script.pages) {
      const s = page.setting?.trim();
      if (s && !labels.has(s)) {
        return {
          success: false,
          message: `page ${page.pageNumber} setting "${s}" does not match any background label`,
        };
      }
    }
  }

  return { success: true, data: script };
}
