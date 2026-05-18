// Durable wrappers around the Gemini pipeline. Each function:
//  - receives an event whose `data.jobId` ties it back to a jobs row,
//  - uses `step.run()` so each substantive unit of work retries
//    independently (Gemini 429s, Supabase hiccups, etc.),
//  - marks the job `done` with a result on success, or `failed` with an
//    error message on failure (including when Inngest's retry budget is
//    fully exhausted — see `onFailure`).
//
// The HTTP routes in /api/... create the job row and emit the event; the
// client polls /api/jobs/[id] for progress.

import { inngest, EVENTS } from "./client";
import {
  markAwaitingCastApproval,
  markDone,
  markFailed,
  markProgress,
  markRunning,
} from "@/lib/jobs";
import { reportError } from "@/lib/sentry";
import {
  assistRegenerateImage,
  assistRegenerateText,
  classifyAssistIntent,
  generateAiCastPortrait,
  generateBackgroundPortrait,
  generateCastPortrait,
  generatePageImageWithCastRefs,
  generateScript,
  inferAiCastDescription,
  GeminiRateLimitError,
  GeminiSafetyBlockedError,
  regeneratePageText,
  type AssistTarget,
} from "@/lib/gemini";
import {
  supabaseAdmin,
  processAndUploadPageImage,
  updateStoryPageFields,
  uploadGeneratedImage,
} from "@/lib/supabase";
import { buildInitialOverlays, DEFAULT_LAYOUT_ID } from "@/lib/layouts";
import type { Layer, MemoryReference, Story } from "@/lib/types";

const TEXT_RETRIES = 2;
const IMAGE_RETRIES = 3;

// Both the script-stage and the page-stage need to read back the
// wizard's prompt payload (outline + memories[]) from stories.prompt.
// Plain strings — legacy / corrupted records — fall back to
// outline-only with no memories. Defensive: every memory entry is
// re-validated structurally before downstream code trusts it.
function parsePromptPayload(raw: string | null | undefined): {
  outline: string;
  memories: MemoryReference[];
} {
  if (!raw) return { outline: "", memories: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { outline: String(raw), memories: [] };
    }
    const outline =
      typeof parsed.outline === "string" ? parsed.outline : "";
    const rawMemories: unknown[] = Array.isArray(parsed.memories)
      ? (parsed.memories as unknown[])
      : [];
    const memories: MemoryReference[] = [];
    for (const entry of rawMemories) {
      if (!entry || typeof entry !== "object") continue;
      const m = entry as Record<string, unknown>;
      if (
        typeof m.id === "string" &&
        typeof m.photoUrl === "string" &&
        typeof m.caption === "string"
      ) {
        memories.push({
          id: m.id,
          photoUrl: m.photoUrl,
          caption: m.caption,
        });
      }
    }
    return { outline, memories };
  } catch {
    return { outline: String(raw), memories: [] };
  }
}

// onFailure handlers receive a wrapped event whose `data.event.data` is the
// original event. We narrow just enough to pull the jobId out.
type WrappedFailureEvent = { data?: { event?: { data?: { jobId?: string } } } };
function extractJobId(wrappedEvent: unknown): string | undefined {
  return (wrappedEvent as WrappedFailureEvent)?.data?.event?.data?.jobId;
}

// Inngest wraps thrown errors so by the time we get to onFailure the
// original class identity is sometimes lost — we recognize a safety
// block by name + message instead. The error.name survives the wrap
// in current Inngest versions; the message check is a backstop for
// anything that re-serializes through JSON.
function isSafetyBlockError(err: unknown): boolean {
  if (err instanceof GeminiSafetyBlockedError) return true;
  if (err && typeof err === "object") {
    const e = err as { name?: unknown; message?: unknown };
    if (e.name === "GeminiSafetyBlockedError") return true;
    if (
      typeof e.message === "string" &&
      e.message.includes("safety filter")
    ) {
      return true;
    }
  }
  return false;
}

// User-facing copy for a safety block. Single source of truth so we
// don't drift between the thrown error and what the polling client
// reads from jobs.error. Echoes GeminiSafetyBlockedError's default
// message verbatim.
const SAFETY_BLOCK_USER_MESSAGE =
  "Your prompt was blocked by the safety filter. Please try a gentler wording — for example, avoid graphic injuries or distressing content.";

async function onInngestFailure(
  wrappedEvent: unknown,
  error: unknown
): Promise<void> {
  const jobId = extractJobId(wrappedEvent);
  // Inngest exhausted retries. Report to Sentry so we see it even
  // though the user-facing surface is the jobs row.
  reportError(error, "inngest.onFailure");
  if (!jobId) return;
  // Rewrite a safety-block error into the canonical user-facing
  // string before persisting to the jobs row. Without this, an
  // Inngest-wrapped error message ("Function exhausted retries: ...")
  // would leak into the UI.
  if (isSafetyBlockError(error)) {
    await markFailed(jobId, new Error(SAFETY_BLOCK_USER_MESSAGE));
    return;
  }
  await markFailed(jobId, error);
}

function composeSystemPrompt(
  global: string | null | undefined,
  perStory: string | null | undefined
): string | null {
  const g = global?.trim();
  const s = perStory?.trim();
  if (g && s) return `${g}\n\n${s}`;
  return g || s || null;
}

async function fetchStoryAndPage(
  storyId: string,
  pageNumber: number,
  expectedUserId: string | null
) {
  // Inngest workers run with no auth session, so the anon client
  // can't see private stories under the new RLS policies. Use the
  // service-role admin client — RLS bypassed, but we re-verify
  // ownership here defensively. The route handler already called
  // assertOwnsStory before firing the event, but the Inngest event
  // bus is its own trust boundary: anyone with INNGEST_EVENT_KEY can
  // fire arbitrary payloads, so we don't take the route's word for it.
  const { data, error } = await supabaseAdmin()
    .from("stories")
    .select(
      "id, title, prompt, pages, ai_system_prompt, art_style_id, user_id"
    )
    .eq("id", storyId)
    .single<
      Pick<
        Story,
        | "id"
        | "title"
        | "prompt"
        | "pages"
        | "ai_system_prompt"
        | "art_style_id"
      > & { user_id: string | null }
    >();
  if (error || !data) throw new Error("Story not found");
  if (
    expectedUserId &&
    data.user_id &&
    data.user_id !== expectedUserId
  ) {
    throw new Error("Story ownership mismatch");
  }
  const page = data.pages.find((p) => p.pageNumber === pageNumber);
  if (!page) throw new Error("Page not found");
  return { story: data, page };
}


// --------------------------------------------------------------------------
// story/regen-text.requested — rewrite a single page's narration.
// --------------------------------------------------------------------------

export const regenTextFn = inngest.createFunction(
  {
    id: "regen-page-text",
    retries: TEXT_RETRIES,
    triggers: [{ event: EVENTS.regenText }],
    onFailure: async ({ event, error }) => onInngestFailure(event, error),
  },
  async ({ event, step }) => {
    const { jobId, userId, storyId, pageNumber } = event.data as {
      jobId: string;
      userId?: string;
      storyId: string;
      pageNumber: number;
    };
    await step.run("mark-running", () => markRunning(jobId));

    const { story } = await step.run("fetch", () =>
      fetchStoryAndPage(storyId, pageNumber, userId ?? null)
    );

    const text = await step.run("regenerate", () =>
      regeneratePageText(
        story.title,
        story.pages.map((p) => ({
          pageNumber: p.pageNumber,
          text: p.text,
        })),
        pageNumber
      )
    );

    await step.run("persist", async () => {
      // Atomic per-page update — only touches this page's slot in the
      // pages JSONB array so a concurrent overlays save on another page
      // can't be clobbered. We still need the overlays for THIS page to
      // mirror the new narration into any layout-source text layer, so
      // we work off the page we fetched above.
      const page = story.pages.find((p) => p.pageNumber === pageNumber);
      const overlays: Layer[] | undefined = page?.overlays?.map((l): Layer =>
        l.source === "layout" && l.type === "text" ? { ...l, text } : l
      );
      await updateStoryPageFields(storyId, pageNumber, {
        text,
        ...(overlays ? { overlays } : {}),
      });
    });

    await step.run("mark-done", () => markDone(jobId, { text }));
    return { text };
  }
);

// --------------------------------------------------------------------------
// assist/text.requested — forced text-only AI edit.
// --------------------------------------------------------------------------

export const assistTextFn = inngest.createFunction(
  {
    id: "assist-text",
    retries: TEXT_RETRIES,
    triggers: [{ event: EVENTS.assistText }],
    onFailure: async ({ event, error }) => onInngestFailure(event, error),
  },
  async ({ event, step }) => {
    const { jobId, userId, storyId, pageNumber, prompt, globalSystemPrompt } =
      event.data as {
        jobId: string;
        userId?: string;
        storyId: string;
        pageNumber: number;
        prompt: string;
        globalSystemPrompt?: string | null;
      };
    await step.run("mark-running", () => markRunning(jobId));

    const { story, page } = await step.run("fetch", () =>
      fetchStoryAndPage(storyId, pageNumber, userId ?? null)
    );

    const text = await step.run("generate", () =>
      assistRegenerateText({
        systemPrompt: composeSystemPrompt(
          globalSystemPrompt,
          story.ai_system_prompt
        ),
        storyTitle: story.title,
        storyPrompt: story.prompt,
        allPages: story.pages.map((p) => ({
          pageNumber: p.pageNumber,
          text: p.text,
        })),
        targetPageNumber: pageNumber,
        userPrompt: prompt,
        currentImageUrl: page.imageUrl,
      })
    );

    await step.run("mark-done", () =>
      markDone(jobId, { targets: ["text"], text, imageUrl: null })
    );
    return { text };
  }
);

// --------------------------------------------------------------------------
// assist/image.requested — forced image-only AI edit.
// --------------------------------------------------------------------------

export const assistImageFn = inngest.createFunction(
  {
    id: "assist-image",
    retries: IMAGE_RETRIES,
    triggers: [{ event: EVENTS.assistImage }],
    onFailure: async ({ event, error }) => onInngestFailure(event, error),
  },
  async ({ event, step }) => {
    const { jobId, userId, storyId, pageNumber, prompt, globalSystemPrompt } =
      event.data as {
        jobId: string;
        userId?: string;
        storyId: string;
        pageNumber: number;
        prompt: string;
        globalSystemPrompt?: string | null;
      };
    await step.run("mark-running", () => markRunning(jobId));

    const { story, page } = await step.run("fetch", () =>
      fetchStoryAndPage(storyId, pageNumber, userId ?? null)
    );

    const urls = await step.run("generate-and-upload", async () => {
      const dataUri = await assistRegenerateImage({
        systemPrompt: composeSystemPrompt(
          globalSystemPrompt,
          story.ai_system_prompt
        ),
        storyTitle: story.title,
        storyPrompt: story.prompt,
        pageText: page.text,
        userPrompt: prompt,
        currentImageUrl: page.imageUrl,
        styleId: story.art_style_id ?? null,
      });
      // Generate clean + watermarked variants so the editor / reader
      // can swap on paid-status without re-encoding on the fly.
      return processAndUploadPageImage(dataUri);
    });

    await step.run("mark-done", () =>
      markDone(jobId, {
        targets: ["image"],
        text: null,
        imageUrl: urls.imageUrl,
        watermarkedImageUrl: urls.watermarkedImageUrl,
      })
    );
    return urls;
  }
);

// --------------------------------------------------------------------------
// assist/infer.requested — classifier + parallel text & image.
// --------------------------------------------------------------------------

export const assistInferFn = inngest.createFunction(
  {
    id: "assist-infer",
    retries: IMAGE_RETRIES,
    triggers: [{ event: EVENTS.assistInfer }],
    onFailure: async ({ event, error }) => onInngestFailure(event, error),
  },
  async ({ event, step }) => {
    const {
      jobId,
      userId,
      storyId,
      pageNumber,
      prompt,
      globalSystemPrompt,
      targets: overrideTargets,
    } = event.data as {
      jobId: string;
      userId?: string;
      storyId: string;
      pageNumber: number;
      prompt: string;
      globalSystemPrompt?: string | null;
      targets?: AssistTarget[];
    };
    await step.run("mark-running", () => markRunning(jobId));

    const { story, page } = await step.run("fetch", () =>
      fetchStoryAndPage(storyId, pageNumber, userId ?? null)
    );
    const systemPrompt = composeSystemPrompt(
      globalSystemPrompt,
      story.ai_system_prompt
    );

    let targets: AssistTarget[];
    if (overrideTargets && overrideTargets.length > 0) {
      targets = overrideTargets;
    } else {
      targets = await step.run("classify", async () => {
        try {
          return await classifyAssistIntent({
            systemPrompt,
            storyPrompt: story.prompt,
            allPagesText: story.pages
              .map((p) => `Page ${p.pageNumber}: ${p.text}`)
              .join("\n"),
            pageText: page.text,
            userPrompt: prompt,
            currentImageUrl: page.imageUrl,
          });
        } catch (err) {
          if (err instanceof GeminiRateLimitError) {
            return ["text", "image"] as AssistTarget[];
          }
          throw err;
        }
      });
    }

    const [text, imageUrls] = await Promise.all([
      targets.includes("text")
        ? step
            .run("text", () =>
              assistRegenerateText({
                systemPrompt,
                storyTitle: story.title,
                storyPrompt: story.prompt,
                allPages: story.pages.map((p) => ({
                  pageNumber: p.pageNumber,
                  text: p.text,
                })),
                targetPageNumber: pageNumber,
                userPrompt: prompt,
                currentImageUrl: page.imageUrl,
              })
            )
            .catch((err: unknown) => {
              console.error("[inngest.infer] text failed:", err);
              return null;
            })
        : Promise.resolve(null),
      targets.includes("image")
        ? step
            .run("image", async () => {
              const dataUri = await assistRegenerateImage({
                systemPrompt,
                storyTitle: story.title,
                storyPrompt: story.prompt,
                pageText: page.text,
                userPrompt: prompt,
                currentImageUrl: page.imageUrl,
                styleId: story.art_style_id ?? null,
              });
              // Returns { imageUrl, watermarkedImageUrl }.
              return processAndUploadPageImage(dataUri);
            })
            .catch((err: unknown) => {
              console.error("[inngest.infer] image failed:", err);
              return null;
            })
        : Promise.resolve(null),
    ]);

    const imageUrl = imageUrls?.imageUrl ?? null;
    const watermarkedImageUrl = imageUrls?.watermarkedImageUrl ?? null;
    await step.run("mark-done", () =>
      markDone(jobId, { targets, text, imageUrl, watermarkedImageUrl })
    );
    return { targets, text, imageUrl, watermarkedImageUrl };
  }
);

// --------------------------------------------------------------------------
// nightly-cleanup — daily housekeeping cron.
//
// Runs at 04:00 UTC every day. Three independent step.run blocks so
// each piece of work retries on its own and a transient failure in
// one doesn't block the others.
//
// Tasks:
//   1. Delete done / failed `jobs` rows older than 30 days. The jobs
//      table is essentially a transient queue; old rows just bloat
//      the table and slow down /api/jobs/[id] lookups.
//   2. Mark `print_orders` rows stuck in 'paid' or 'pending' for
//      more than 48h *with no stripe_session_id* as 'expired'. These
//      are orders the user abandoned or where Stripe didn't fire the
//      webhook in time — the admin needs to see them, so we never
//      delete, just status-transition.
//   3. (TODO) Storage orphan sweep — walk `uploads` bucket and delete
//      blobs that no story / pet row references. Skipped for now: no
//      cheap way to enumerate referenced URLs (they're embedded in
//      stories.pages JSONB + cover_image + pets.photos JSONB), and
//      a naive sweep risks deleting in-flight uploads. Revisit when
//      we have a content-addressed naming scheme.
// --------------------------------------------------------------------------

interface DeletedJobsRow {
  id: string;
}
interface ExpiredOrderRow {
  id: string;
}

export const nightlyCleanupFn = inngest.createFunction(
  {
    id: "nightly-cleanup",
    name: "Nightly cleanup",
    triggers: [{ cron: "0 4 * * *" }],
  },
  async ({ step }) => {
    // 1. Old terminal jobs.
    const jobsDeleted = await step.run("delete-old-jobs", async () => {
      const cutoff = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ).toISOString();
      const { data, error } = await supabaseAdmin()
        .from("jobs")
        .delete()
        .in("status", ["done", "failed"])
        .lt("updated_at", cutoff)
        .select("id")
        .returns<DeletedJobsRow[]>();
      if (error) {
        console.error("[nightly-cleanup] delete-old-jobs failed:", error);
        return 0;
      }
      return data?.length ?? 0;
    });

    // 2. Stuck pre-fulfillment print_orders. We only touch rows that
    // never got a stripe_session_id assigned — anything with a
    // session id has gone through (or is going through) the Stripe
    // webhook pipeline, and we don't want to second-guess that.
    const ordersExpired = await step.run(
      "expire-stuck-print-orders",
      async () => {
        const cutoff = new Date(
          Date.now() - 48 * 60 * 60 * 1000
        ).toISOString();
        const { data, error } = await supabaseAdmin()
          .from("print_orders")
          .update({ status: "expired" })
          .in("status", ["paid", "pending"])
          .is("stripe_session_id", null)
          .lt("created_at", cutoff)
          .select("id")
          .returns<ExpiredOrderRow[]>();
        if (error) {
          console.error(
            "[nightly-cleanup] expire-stuck-print-orders failed:",
            error
          );
          return 0;
        }
        const n = data?.length ?? 0;
        if (n > 0) {
          // Audit log so the admin queue surfaces the transition.
          await supabaseAdmin()
            .from("print_order_events")
            .insert(
              (data ?? []).map((r) => ({
                order_id: r.id,
                status: "expired",
                note: "Auto-expired by nightly cleanup (>48h with no Stripe session).",
              }))
            );
        }
        return n;
      }
    );

    // 3. Storage orphan sweep — TODO (see header comment).

    return { jobsDeleted, ordersExpired };
  }
);

// ---------------------------------------------------------------------------
// V2 generation pipeline (creation flow overhaul)
//
// Stage 1 (script) + Stage 2 (cast portraits) run inside generateStoryV2Fn.
// After Stage 2 the job is parked in `awaiting_cast_approval` and we
// return — Inngest functions are not the place to wait on human input.
// The user's "Approve all" click hits /api/stories/[id]/approve-cast,
// which sends EVENTS.castApproved; generatePagesAfterApprovalFn picks
// that up and fans out per-page image generation. Per-character regen
// runs in its own short-lived function.
// ---------------------------------------------------------------------------

interface StoryV2Context {
  story: {
    id: string;
    user_id: string;
    title: string | null;
    prompt: string;
    page_count: number;
    recipient_type: import("@/lib/types").RecipientType;
    occasion: import("@/lib/types").Occasion | null;
    story_tone: import("@/lib/types").StoryTone;
    art_style_id: string;
    cast_character_ids: string[];
    default_text_size: number | null;
  };
  cast: import("@/lib/types").Character[];
  style: {
    id: string;
    display_name: string;
    prompt_scaffold: string;
  };
}

interface CastPortraitEntry {
  characterId: string;
  name: string;
  portraitUrl: string;
  cached: boolean;
}

// AI-cast portrait entry. Distinct shape from CastPortraitEntry: no
// characterId (the source-of-truth id lives on story_ai_cast), and
// includes the role label so the approval gate can display it.
interface AiCastPortraitEntry {
  aiCastId: string;
  name: string;
  roleLabel: string | null;
  kind: "person" | "pet";
  portraitUrl: string;
}

// Spec B: background portrait entry for the approval-gate job
// payload. story_backgrounds is the source of truth for everything
// else (description, user_prompt_addition); this is just enough for
// the gate to render the Settings section without re-querying.
interface BackgroundPortraitEntry {
  bgId: string;
  label: string;
  portraitUrl: string;
}

// Discriminator for "is this characterId a user-cast UUID or a
// script-invented name?" — used by Stage 1.5 to partition
// script.pages[].characterIds.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const generateStoryV2Fn = inngest.createFunction(
  {
    id: "story-generate-v2",
    name: "Generate story (V2: script + cast portraits)",
    retries: TEXT_RETRIES,
    triggers: [{ event: EVENTS.storyGenerateV2 }],
    onFailure: async ({ event, error }) => onInngestFailure(event, error),
  },
  async ({ event, step }) => {
    const data = event.data as {
      jobId: string;
      storyId: string;
      userId: string;
    };
    const { jobId, storyId } = data;
    await markRunning(jobId);

    const ctx: StoryV2Context = await step.run("load-context", async () => {
      const admin = supabaseAdmin();
      const { data: story, error: storyErr } = await admin
        .from("stories")
        .select(
          "id, user_id, title, prompt, page_count, recipient_type, occasion, story_tone, art_style_id, cast_character_ids, default_text_size"
        )
        .eq("id", storyId)
        .single<StoryV2Context["story"]>();
      if (storyErr || !story) throw new Error(`load story: ${storyErr?.message}`);

      const { data: cast, error: castErr } = await admin
        .from("characters")
        .select("*")
        .in("id", story.cast_character_ids);
      if (castErr) throw new Error(`load cast: ${castErr.message}`);

      const { data: style, error: styleErr } = await admin
        .from("art_styles")
        .select("id, display_name, prompt_scaffold")
        .eq("id", story.art_style_id)
        .single<StoryV2Context["style"]>();
      if (styleErr || !style) throw new Error(`load style: ${styleErr?.message}`);

      return {
        story,
        cast: (cast ?? []) as import("@/lib/types").Character[],
        style,
      };
    });

    const script = await step.run("generate-script", async () => {
      // The wizard's outline + memory reference photos live on
      // stories.prompt as a JSON-encoded payload (see /api/generate/v2).
      // Plain strings (pre-V2 / legacy) fall back to outline-only.
      const { outline, memories } = parsePromptPayload(ctx.story.prompt);

      const s = await generateScript({
        recipientType: ctx.story.recipient_type,
        occasion: ctx.story.occasion ?? undefined,
        storyTone: ctx.story.story_tone,
        cast: ctx.cast,
        outline,
        memories,
        pageCount: ctx.story.page_count,
      });

      // Respect a user-provided title from the wizard. Only fall back to
      // the AI-generated title when the stored title is missing or is the
      // "Untitled story" sentinel that route.ts uses for blank input.
      const userTitle = ctx.story.title?.trim();
      const finalTitle =
        userTitle && userTitle !== "Untitled story" ? userTitle : s.title;
      const { error } = await supabaseAdmin()
        .from("stories")
        .update({ script: s, title: finalTitle })
        .eq("id", storyId);
      if (error) throw new Error(`persist script: ${error.message}`);
      return s;
    });

    // Stage 1.5: extract AI cast members from the script. Any
    // characterId in script.pages that isn't a UUID of a user-cast
    // character is treated as a script-invented name and gets a
    // story_ai_cast row + Flash-inferred {role, kind, description}.
    // Idempotent: pre-existing rows for the same name are reused.
    const aiCastRows = await step.run("extract-ai-cast", async () => {
      const admin = supabaseAdmin();
      const userCastIds = new Set(ctx.cast.map((c) => c.id));

      // Collect every non-UUID id and the sceneDescriptions where it
      // appears. Names are taken verbatim — the script prompt asks
      // the model to be consistent about a given character's name
      // across pages, but we tolerate light variation by lower-case
      // matching against existing rows below.
      const nameToScenes = new Map<string, string[]>();
      for (const page of script.pages) {
        for (const id of page.characterIds) {
          if (UUID_RE.test(id)) {
            if (!userCastIds.has(id)) {
              console.warn(
                "[stage 1.5] script references unknown UUID:",
                id
              );
            }
            continue;
          }
          const scenes = nameToScenes.get(id) ?? [];
          scenes.push(page.sceneDescription);
          nameToScenes.set(id, scenes);
        }
      }

      if (nameToScenes.size === 0) {
        return [] as import("@/lib/types").AiCastMember[];
      }

      // Look up existing AI-cast rows for this story so a re-run
      // doesn't duplicate them. Match case-insensitively on name.
      const { data: existing } = await admin
        .from("story_ai_cast")
        .select("id, name")
        .eq("story_id", storyId);
      const existingByName = new Map<string, string>();
      for (const row of existing ?? []) {
        existingByName.set(row.name.toLowerCase(), row.id);
      }

      const toInsert: Array<{
        story_id: string;
        name: string;
        role_label: string | null;
        kind: "person" | "pet";
        description: string;
      }> = [];
      for (const [name, scenes] of nameToScenes) {
        if (existingByName.has(name.toLowerCase())) continue;
        const inferred = await inferAiCastDescription({
          name,
          sceneDescriptions: scenes,
          recipientType: ctx.story.recipient_type,
          occasion: ctx.story.occasion ?? undefined,
        });
        // Degrade gracefully: if the Flash call fails, insert a row
        // with a generic description so Stage 2.5 still has something
        // to render. Better than aborting the whole job.
        toInsert.push({
          story_id: storyId,
          name,
          role_label: inferred?.role ?? "supporting character",
          kind: inferred?.kind ?? "person",
          description:
            inferred?.description ??
            `${name} appears in this storybook as a supporting character. Render with consistent features across pages.`,
        });
      }

      if (toInsert.length > 0) {
        const { error } = await admin.from("story_ai_cast").insert(toInsert);
        if (error) throw new Error(`insert ai cast: ${error.message}`);
      }

      // Re-read so we get a unified list (existing + just-inserted)
      // with portrait_url + user_prompt_addition populated for the
      // next step. Don't trust the insert response — re-runs need
      // existing rows too.
      const { data: all } = await admin
        .from("story_ai_cast")
        .select("*")
        .eq("story_id", storyId);
      return (all ?? []) as import("@/lib/types").AiCastMember[];
    });

    const portraits: CastPortraitEntry[] = await step.run(
      "generate-cast-portraits",
      async () => {
        const admin = supabaseAdmin();

        const usedIds = new Set<string>();
        for (const p of script.pages)
          for (const id of p.characterIds) usedIds.add(id);
        const usedCast = ctx.cast.filter((c) => usedIds.has(c.id));
        const usedCastIds = usedCast.map((c) => c.id);

        // Batch the cache lookup. Previously this issued one
        // .maybeSingle() per character, which is N+1 chatty AND opened
        // a race window where two concurrent story-generations for
        // overlapping cast would both observe a cache miss, both
        // generate, and the loser would burn an Inngest retry on a
        // UNIQUE(character_id, art_style_id) violation. One query up
        // front shrinks the race window; the conflict-tolerant insert
        // below closes the rest.
        const cached = new Map<string, string>();
        if (usedCastIds.length > 0) {
          const { data: rows } = await admin
            .from("character_portraits")
            .select("character_id, portrait_url")
            .in("character_id", usedCastIds)
            .eq("art_style_id", ctx.style.id);
          for (const row of rows ?? []) {
            cached.set(row.character_id, row.portrait_url);
          }
        }

        return Promise.all(
          usedCast.map(async (c): Promise<CastPortraitEntry> => {
            const cachedUrl = cached.get(c.id);
            if (cachedUrl) {
              return {
                characterId: c.id,
                name: c.name,
                portraitUrl: cachedUrl,
                cached: true,
              };
            }

            const dataUri = await generateCastPortrait({
              character: c,
              artStylePromptScaffold: ctx.style.prompt_scaffold,
            });
            const portraitUrl = await uploadGeneratedImage(dataUri);

            const inserted = await insertPortraitOrFetchWinner(admin, {
              characterId: c.id,
              artStyleId: ctx.style.id,
              portraitUrl,
            });

            return {
              characterId: c.id,
              name: c.name,
              portraitUrl: inserted.portraitUrl,
              cached: inserted.lostRace,
            };
          })
        );
      }
    );

    // Stage 1.6: extract canonical backgrounds from the script's
    // top-level backgrounds[] array (Spec B). Pure validate-and-
    // insert — the model already grouped + described in Stage 1.
    // Schema-level refinement in parseScript already validated that
    // every page's `setting` matches one of these labels.
    const bgRows = await step.run("extract-backgrounds", async () => {
      const admin = supabaseAdmin();
      const bgs = script.backgrounds ?? [];
      if (bgs.length === 0) {
        return [] as import("@/lib/types").Background[];
      }

      // Idempotency: a previous successful run for this story may
      // have already inserted these. Look up + skip duplicates by
      // case-insensitive label match.
      const { data: existing } = await admin
        .from("story_backgrounds")
        .select("id, label")
        .eq("story_id", storyId);
      const existingByLabel = new Map<string, string>();
      for (const row of existing ?? []) {
        existingByLabel.set(row.label.toLowerCase(), row.id);
      }

      const toInsert: Array<{
        story_id: string;
        label: string;
        description: string;
      }> = [];
      for (const bg of bgs) {
        if (existingByLabel.has(bg.label.toLowerCase())) continue;
        toInsert.push({
          story_id: storyId,
          label: bg.label,
          description: bg.description,
        });
      }

      if (toInsert.length > 0) {
        const { error } = await admin
          .from("story_backgrounds")
          .insert(toInsert);
        if (error) throw new Error(`insert backgrounds: ${error.message}`);
      }

      const { data: all } = await admin
        .from("story_backgrounds")
        .select("*")
        .eq("story_id", storyId);
      return (all ?? []) as import("@/lib/types").Background[];
    });

    // Stage 2.5: portraits for the AI-cast rows extracted in Stage
    // 1.5. Each row stores its own portrait_url (no cross-story
    // caching — descriptions are per-story). Rows that already have
    // a portrait_url (re-run, or earlier successful generation)
    // skip regeneration.
    const aiPortraits: AiCastPortraitEntry[] = await step.run(
      "generate-ai-cast-portraits",
      async () => {
        if (aiCastRows.length === 0) return [];
        const admin = supabaseAdmin();
        return Promise.all(
          aiCastRows.map(async (row): Promise<AiCastPortraitEntry> => {
            if (row.portrait_url) {
              return {
                aiCastId: row.id,
                name: row.name,
                roleLabel: row.role_label,
                kind: row.kind,
                portraitUrl: row.portrait_url,
              };
            }
            const dataUri = await generateAiCastPortrait({
              name: row.name,
              kind: row.kind,
              roleLabel: row.role_label,
              description: row.description,
              userPromptAddition: row.user_prompt_addition,
              artStylePromptScaffold: ctx.style.prompt_scaffold,
            });
            const portraitUrl = await uploadGeneratedImage(dataUri);
            await admin
              .from("story_ai_cast")
              .update({ portrait_url: portraitUrl })
              .eq("id", row.id);
            return {
              aiCastId: row.id,
              name: row.name,
              roleLabel: row.role_label,
              kind: row.kind,
              portraitUrl,
            };
          })
        );
      }
    );

    // Stage 2.6: portraits for the backgrounds extracted in Stage
    // 1.6. Each row stores its own portrait_url (no cross-story
    // caching). Same null-check semantics as Stage 2.5: rows with
    // an existing portrait_url skip regeneration so retries/resumes
    // don't redo finished work.
    const bgPortraits: BackgroundPortraitEntry[] = await step.run(
      "generate-background-portraits",
      async () => {
        if (bgRows.length === 0) return [];
        const admin = supabaseAdmin();
        return Promise.all(
          bgRows.map(async (row): Promise<BackgroundPortraitEntry> => {
            if (row.portrait_url) {
              return {
                bgId: row.id,
                label: row.label,
                portraitUrl: row.portrait_url,
              };
            }
            const dataUri = await generateBackgroundPortrait({
              label: row.label,
              description: row.description,
              userPromptAddition: row.user_prompt_addition,
              artStylePromptScaffold: ctx.style.prompt_scaffold,
            });
            const portraitUrl = await uploadGeneratedImage(dataUri);
            await admin
              .from("story_backgrounds")
              .update({ portrait_url: portraitUrl })
              .eq("id", row.id);
            return {
              bgId: row.id,
              label: row.label,
              portraitUrl,
            };
          })
        );
      }
    );

    await markAwaitingCastApproval(jobId, {
      stage: "awaiting_cast_approval",
      storyId,
      portraits,
      aiPortraits,
      bgPortraits,
    });

    return { jobId, storyId, awaitingCastApproval: true };
  }
);

export const generatePagesAfterApprovalFn = inngest.createFunction(
  {
    id: "generate-pages-after-approval",
    name: "Generate pages (V2: after cast approval)",
    retries: IMAGE_RETRIES,
    triggers: [{ event: EVENTS.castApproved }],
    onFailure: async ({ event, error }) => onInngestFailure(event, error),
  },
  async ({ event, step }) => {
    const { jobId, storyId } = event.data as {
      jobId: string;
      storyId: string;
    };
    await markRunning(jobId);

    const ctx = await step.run("load-pages-context", async () => {
      const admin = supabaseAdmin();
      const { data: story, error } = await admin
        .from("stories")
        .select(
          "id, script, prompt, art_style_id, cast_character_ids, page_count, default_text_size"
        )
        .eq("id", storyId)
        .single<{
          id: string;
          script: import("@/lib/types").Script;
          prompt: string;
          art_style_id: string;
          cast_character_ids: string[];
          page_count: number;
          default_text_size: number | null;
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

      // AI-cast for this story (Spec A). Pages reference these by
      // name (verbatim string in characterIds). Pull them alongside
      // user-cast portraits so the per-page step can resolve either.
      const { data: aiCast } = await admin
        .from("story_ai_cast")
        .select("id, name, portrait_url")
        .eq("story_id", storyId)
        .not("portrait_url", "is", null);

      // Backgrounds for this story (Spec B). Pages reference these
      // by `setting` label. Stage 3 attaches the matching portrait
      // as the first image part in the page-image call.
      const { data: backgrounds } = await admin
        .from("story_backgrounds")
        .select("label, portrait_url")
        .eq("story_id", storyId)
        .not("portrait_url", "is", null);

      // Re-parse the wizard prompt payload so the per-page step has
      // access to memory photo URLs + captions. The script-stage
      // refinement already guarantees every memory id is referenced at
      // least once, so this map is safe to look up against.
      const { memories } = parsePromptPayload(story.prompt);

      // Seed empty pages so the Studio can render placeholders while
      // images come in. updateStoryPageFields will fill imageUrl per page.
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

      // Return plain arrays — Inngest serializes step.run output to JSON,
      // which would turn a Map into {}.
      return {
        story,
        style,
        portraits: portraits ?? [],
        cast: cast ?? [],
        aiCast: aiCast ?? [],
        backgrounds: backgrounds ?? [],
        memories,
      };
    });

    // Unified resolution map: characterId-or-name → {name, portraitUrl}.
    // User-cast entries live under their UUID; AI-cast entries live
    // under their name (the script's verbatim string). Per-page lookup
    // tries the same key against this map regardless of which type.
    type ResolvedRef = { name: string; portraitUrl: string };
    const resolveById = new Map<string, ResolvedRef>();
    const nameByCharId = new Map<string, string>();
    for (const c of ctx.cast) nameByCharId.set(c.id, c.name);
    for (const p of ctx.portraits) {
      const name = nameByCharId.get(p.character_id);
      if (name) {
        resolveById.set(p.character_id, { name, portraitUrl: p.portrait_url });
      }
    }
    for (const a of ctx.aiCast) {
      if (a.portrait_url) {
        resolveById.set(a.name, {
          name: a.name,
          portraitUrl: a.portrait_url,
        });
      }
    }
    // Spec B: background label → portrait URL. Per-page lookup tries
    // the page's `setting` against this map; misses (empty setting,
    // or a label without a generated portrait) fall through to
    // "no background ref" — same as today's pre-Spec-B behavior.
    const bgByLabel = new Map<string, { label: string; portraitUrl: string }>();
    for (const bg of ctx.backgrounds) {
      if (bg.portrait_url) {
        bgByLabel.set(bg.label, {
          label: bg.label,
          portraitUrl: bg.portrait_url,
        });
      }
    }
    const memoryById = new Map<string, MemoryReference>();
    for (const m of ctx.memories) memoryById.set(m.id, m);

    const pages = ctx.story.script.pages;
    await Promise.all(
      pages.map((p) =>
        step.run(`generate-page-${p.pageNumber}`, async () => {
          const castOnPage = p.characterIds
            .map((id) => resolveById.get(id) ?? null)
            .filter(
              (x): x is { name: string; portraitUrl: string } => x !== null
            );

          // Build the page's memory inputs by joining script-emitted
          // memoryReferences (id + usage) against the wizard's memory
          // map (id → photoUrl + caption). Drops any ref whose id is
          // missing from the map; the script-stage refinement makes
          // this defensive rather than load-bearing.
          const memoryRefsOnPage = (p.memoryReferences ?? [])
            .map((ref) => {
              const m = memoryById.get(ref.memoryId);
              return m
                ? {
                    caption: m.caption,
                    photoUrl: m.photoUrl,
                    usage: ref.usage,
                  }
                : null;
            })
            .filter(
              (x): x is { caption: string; photoUrl: string; usage: string } =>
                x !== null
            );

          // Resolve this page's setting → canonical background
          // portrait (Spec B). Empty / missing / unmatched setting
          // falls through to no background ref.
          const settingLabel = p.setting?.trim();
          const backgroundPortrait =
            settingLabel && bgByLabel.has(settingLabel)
              ? bgByLabel.get(settingLabel)
              : null;

          const dataUri = await generatePageImageWithCastRefs({
            sceneDescription: p.sceneDescription,
            artStylePromptScaffold: ctx.style.prompt_scaffold,
            castPortraitsOnPage: castOnPage,
            memoryRefsOnPage,
            backgroundPortrait,
          });
          // Upload original + StoryInk-watermarked variant. The
          // reader / canvas pick between the two based on the
          // viewer's paid status; the print PDF always reads
          // `imageUrl`.
          const { imageUrl, watermarkedImageUrl } =
            await processAndUploadPageImage(dataUri);

          const overlays = buildInitialOverlays(
            imageUrl,
            p.text,
            ctx.story.default_text_size
          );
          await updateStoryPageFields(storyId, p.pageNumber, {
            imageUrl,
            watermarkedImageUrl,
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

    await step.run("set-cover", async () => {
      const admin = supabaseAdmin();
      const { data: story } = await admin
        .from("stories")
        .select("pages")
        .eq("id", storyId)
        .single<{
          pages: Array<{
            pageNumber: number;
            imageUrl: string;
            watermarkedImageUrl?: string;
          }>;
        }>();
      const first = story?.pages?.find((p) => p.pageNumber === 1);
      if (first?.imageUrl) {
        // cover_image stays canonical for the print PDF;
        // cover_image_watermarked is what library/sample/OG renderers
        // show to viewers without full access.
        await admin
          .from("stories")
          .update({
            cover_image: first.imageUrl,
            cover_image_watermarked:
              first.watermarkedImageUrl ?? first.imageUrl,
          })
          .eq("id", storyId);
      }
    });

    await markDone(jobId, { stage: "done", storyId });
    return { jobId, storyId, done: true };
  }
);

export const regenerateCastPortraitFn = inngest.createFunction(
  {
    id: "regenerate-cast-portrait",
    name: "Regenerate one cast portrait",
    retries: IMAGE_RETRIES,
    triggers: [{ event: EVENTS.characterRegenerate }],
    onFailure: async ({ event, error }) => onInngestFailure(event, error),
  },
  async ({ event, step }) => {
    const { jobId, storyId, characterId } = event.data as {
      jobId: string;
      storyId: string;
      characterId: string;
    };
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
        .single<import("@/lib/types").Character>();
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

      // Regenerate semantics: the user explicitly asked for a new
      // portrait, so upsert with onConflict overwrites whatever was
      // there. This is idempotent under concurrent regen requests —
      // last writer wins, no UNIQUE violation, no failed step.
      const { error: upsertErr } = await admin
        .from("character_portraits")
        .upsert(
          {
            character_id: characterId,
            art_style_id: story.art_style_id,
            portrait_url: portraitUrl,
          },
          { onConflict: "character_id,art_style_id" }
        );
      if (upsertErr)
        throw new Error(`portrait upsert: ${upsertErr.message}`);

      await markDone(jobId, {
        stage: "regenerated",
        characterId,
        portraitUrl,
      });
    });
  }
);

// Spec A: regenerate a single AI-cast portrait. Mirrors
// regenerateCastPortraitFn but reads from story_ai_cast (where the
// description + optional user_prompt_addition live) instead of
// characters + character_portraits.
export const regenerateAiCastPortraitFn = inngest.createFunction(
  {
    id: "regenerate-ai-cast-portrait",
    name: "Regenerate one AI cast portrait",
    retries: IMAGE_RETRIES,
    triggers: [{ event: EVENTS.aiCastRegenerate }],
    onFailure: async ({ event, error }) => onInngestFailure(event, error),
  },
  async ({ event, step }) => {
    const { jobId, storyId, aiCastId, promptAddition } = event.data as {
      jobId: string;
      storyId: string;
      aiCastId: string;
      promptAddition?: string;
    };
    await markRunning(jobId);

    await step.run("regen", async () => {
      const admin = supabaseAdmin();
      const { data: story } = await admin
        .from("stories")
        .select("art_style_id")
        .eq("id", storyId)
        .single<{ art_style_id: string }>();
      if (!story) throw new Error("story missing");

      const { data: row } = await admin
        .from("story_ai_cast")
        .select("*")
        .eq("id", aiCastId)
        .single<import("@/lib/types").AiCastMember>();
      if (!row) throw new Error("ai cast row missing");

      const { data: style } = await admin
        .from("art_styles")
        .select("prompt_scaffold")
        .eq("id", story.art_style_id)
        .single<{ prompt_scaffold: string }>();
      if (!style) throw new Error("style missing");

      // If the caller passed promptAddition, persist it before
      // regenerating so the new portrait actually reflects it AND a
      // future regenerate (with no override) replays the same prompt.
      // Passing an empty string clears the addition.
      const effectiveAddition =
        promptAddition === undefined ? row.user_prompt_addition : promptAddition;
      if (promptAddition !== undefined) {
        await admin
          .from("story_ai_cast")
          .update({ user_prompt_addition: promptAddition || null })
          .eq("id", aiCastId);
      }

      const dataUri = await generateAiCastPortrait({
        name: row.name,
        kind: row.kind,
        roleLabel: row.role_label,
        description: row.description,
        userPromptAddition: effectiveAddition,
        artStylePromptScaffold: style.prompt_scaffold,
      });
      const portraitUrl = await uploadGeneratedImage(dataUri);

      const { error: updateErr } = await admin
        .from("story_ai_cast")
        .update({ portrait_url: portraitUrl })
        .eq("id", aiCastId);
      if (updateErr) {
        throw new Error(`ai cast portrait update: ${updateErr.message}`);
      }

      await markDone(jobId, {
        stage: "ai_cast_regenerated",
        aiCastId,
        portraitUrl,
      });
    });
  }
);

// Spec A + Spec B: re-run Stage 1 (script) after the user removes
// an AI-cast member OR a background at the approval gate. The
// removed name/label is added to the matching exclusion list on
// the script prompt; the new script may surface a different
// supporting cast and/or different backgrounds. Stages 1.5, 1.6,
// 2.5, 2.6 reconcile story_ai_cast + story_backgrounds against
// the new script. Both triggers route here so the script + cast +
// backgrounds always end up in sync after any single removal.
export const regenerateScriptAfterRemovalFn = inngest.createFunction(
  {
    id: "regenerate-script-after-removal",
    name: "Re-run script + cast + backgrounds after removal",
    retries: TEXT_RETRIES,
    triggers: [
      { event: EVENTS.aiCastRemoved },
      { event: EVENTS.backgroundRemoved },
    ],
    onFailure: async ({ event, error }) => onInngestFailure(event, error),
  },
  async ({ event, step }) => {
    const data = event.data as {
      jobId: string;
      storyId: string;
      removedName?: string; // aiCastRemoved payload
      removedLabel?: string; // backgroundRemoved payload
    };
    const { jobId, storyId } = data;
    const excludedAiCharacterNames = data.removedName ? [data.removedName] : [];
    const excludedBackgroundLabels = data.removedLabel ? [data.removedLabel] : [];
    await markRunning(jobId);

    const ctx: StoryV2Context = await step.run("load-context", async () => {
      const admin = supabaseAdmin();
      const { data: story, error: storyErr } = await admin
        .from("stories")
        .select(
          "id, user_id, title, prompt, page_count, recipient_type, occasion, story_tone, art_style_id, cast_character_ids, default_text_size"
        )
        .eq("id", storyId)
        .single<StoryV2Context["story"]>();
      if (storyErr || !story) throw new Error(`load story: ${storyErr?.message}`);

      const { data: cast } = await admin
        .from("characters")
        .select("*")
        .in("id", story.cast_character_ids);

      const { data: style, error: styleErr } = await admin
        .from("art_styles")
        .select("id, display_name, prompt_scaffold")
        .eq("id", story.art_style_id)
        .single<StoryV2Context["style"]>();
      if (styleErr || !style) throw new Error(`load style: ${styleErr?.message}`);

      return {
        story,
        cast: (cast ?? []) as import("@/lib/types").Character[],
        style,
      };
    });

    // Drop any cached AI-cast + background rows. They'll be re-
    // extracted from the new script. (User-cast portraits in
    // character_portraits stay — they're keyed by character_id,
    // not by script content.)
    await step.run("clear-derived-rows", async () => {
      const admin = supabaseAdmin();
      const { error: castErr } = await admin
        .from("story_ai_cast")
        .delete()
        .eq("story_id", storyId);
      if (castErr) throw new Error(`clear ai cast: ${castErr.message}`);
      const { error: bgErr } = await admin
        .from("story_backgrounds")
        .delete()
        .eq("story_id", storyId);
      if (bgErr) throw new Error(`clear backgrounds: ${bgErr.message}`);
    });

    const script = await step.run("regen-script", async () => {
      const { outline, memories } = parsePromptPayload(ctx.story.prompt);
      const s = await generateScript({
        recipientType: ctx.story.recipient_type,
        occasion: ctx.story.occasion ?? undefined,
        storyTone: ctx.story.story_tone,
        cast: ctx.cast,
        outline,
        memories,
        pageCount: ctx.story.page_count,
        excludedAiCharacterNames,
        excludedBackgroundLabels,
      });
      const userTitle = ctx.story.title?.trim();
      const finalTitle =
        userTitle && userTitle !== "Untitled story" ? userTitle : s.title;
      const { error } = await supabaseAdmin()
        .from("stories")
        .update({ script: s, title: finalTitle })
        .eq("id", storyId);
      if (error) throw new Error(`persist script: ${error.message}`);
      return s;
    });

    // Stage 1.5 again — extract AI cast from the new script.
    const newAiCastRows = await step.run("re-extract-ai-cast", async () => {
      const admin = supabaseAdmin();
      const userCastIds = new Set(ctx.cast.map((c) => c.id));
      const nameToScenes = new Map<string, string[]>();
      for (const page of script.pages) {
        for (const id of page.characterIds) {
          if (UUID_RE.test(id)) continue;
          const scenes = nameToScenes.get(id) ?? [];
          scenes.push(page.sceneDescription);
          nameToScenes.set(id, scenes);
        }
        // Hallucinated UUIDs warning (rare)
        for (const id of page.characterIds) {
          if (UUID_RE.test(id) && !userCastIds.has(id)) {
            console.warn(
              "[stage 1.5 re-run] script references unknown UUID:",
              id
            );
          }
        }
      }
      if (nameToScenes.size === 0)
        return [] as import("@/lib/types").AiCastMember[];

      const toInsert: Array<{
        story_id: string;
        name: string;
        role_label: string | null;
        kind: "person" | "pet";
        description: string;
      }> = [];
      for (const [name, scenes] of nameToScenes) {
        const inferred = await inferAiCastDescription({
          name,
          sceneDescriptions: scenes,
          recipientType: ctx.story.recipient_type,
          occasion: ctx.story.occasion ?? undefined,
        });
        toInsert.push({
          story_id: storyId,
          name,
          role_label: inferred?.role ?? "supporting character",
          kind: inferred?.kind ?? "person",
          description:
            inferred?.description ??
            `${name} appears in this storybook as a supporting character. Render with consistent features across pages.`,
        });
      }
      if (toInsert.length > 0) {
        const { error } = await admin.from("story_ai_cast").insert(toInsert);
        if (error) throw new Error(`insert ai cast: ${error.message}`);
      }
      const { data: all } = await admin
        .from("story_ai_cast")
        .select("*")
        .eq("story_id", storyId);
      return (all ?? []) as import("@/lib/types").AiCastMember[];
    });

    // Stage 2.5 again — generate portraits for any newly-extracted
    // AI cast. Existing user-cast portraits in character_portraits
    // are still valid (keyed by character_id, not by script content)
    // so this re-run does NOT touch them.
    const aiPortraits: AiCastPortraitEntry[] = await step.run(
      "re-generate-ai-cast-portraits",
      async () => {
        if (newAiCastRows.length === 0) return [];
        const admin = supabaseAdmin();
        return Promise.all(
          newAiCastRows.map(async (row): Promise<AiCastPortraitEntry> => {
            const dataUri = await generateAiCastPortrait({
              name: row.name,
              kind: row.kind,
              roleLabel: row.role_label,
              description: row.description,
              userPromptAddition: row.user_prompt_addition,
              artStylePromptScaffold: ctx.style.prompt_scaffold,
            });
            const portraitUrl = await uploadGeneratedImage(dataUri);
            await admin
              .from("story_ai_cast")
              .update({ portrait_url: portraitUrl })
              .eq("id", row.id);
            return {
              aiCastId: row.id,
              name: row.name,
              roleLabel: row.role_label,
              kind: row.kind,
              portraitUrl,
            };
          })
        );
      }
    );

    // Stage 1.6 again — re-extract backgrounds from the new script.
    const newBgRows = await step.run("re-extract-backgrounds", async () => {
      const admin = supabaseAdmin();
      const bgs = script.backgrounds ?? [];
      if (bgs.length === 0)
        return [] as import("@/lib/types").Background[];

      const toInsert = bgs.map((bg) => ({
        story_id: storyId,
        label: bg.label,
        description: bg.description,
      }));
      const { error } = await admin
        .from("story_backgrounds")
        .insert(toInsert);
      if (error) throw new Error(`insert backgrounds: ${error.message}`);
      const { data: all } = await admin
        .from("story_backgrounds")
        .select("*")
        .eq("story_id", storyId);
      return (all ?? []) as import("@/lib/types").Background[];
    });

    // Stage 2.6 again — generate portraits for the new background
    // rows.
    const bgPortraits: BackgroundPortraitEntry[] = await step.run(
      "re-generate-background-portraits",
      async () => {
        if (newBgRows.length === 0) return [];
        const admin = supabaseAdmin();
        return Promise.all(
          newBgRows.map(async (row): Promise<BackgroundPortraitEntry> => {
            const dataUri = await generateBackgroundPortrait({
              label: row.label,
              description: row.description,
              userPromptAddition: row.user_prompt_addition,
              artStylePromptScaffold: ctx.style.prompt_scaffold,
            });
            const portraitUrl = await uploadGeneratedImage(dataUri);
            await admin
              .from("story_backgrounds")
              .update({ portrait_url: portraitUrl })
              .eq("id", row.id);
            return {
              bgId: row.id,
              label: row.label,
              portraitUrl,
            };
          })
        );
      }
    );

    // Re-read user-cast portraits so the new awaiting-approval payload
    // matches the format generateStoryV2Fn produces. Stage 3 reads
    // straight from the DB so it doesn't depend on this payload, but
    // the approve-cast UI does.
    const portraits = await step.run("read-user-cast-portraits", async () => {
      const admin = supabaseAdmin();
      const usedIds = new Set<string>();
      for (const p of script.pages)
        for (const id of p.characterIds) {
          if (UUID_RE.test(id)) usedIds.add(id);
        }
      const usedCast = ctx.cast.filter((c) => usedIds.has(c.id));
      if (usedCast.length === 0) return [] as CastPortraitEntry[];
      const { data: rows } = await admin
        .from("character_portraits")
        .select("character_id, portrait_url")
        .in(
          "character_id",
          usedCast.map((c) => c.id)
        )
        .eq("art_style_id", ctx.style.id);
      const byId = new Map((rows ?? []).map((r) => [r.character_id, r.portrait_url]));
      return usedCast
        .map((c): CastPortraitEntry | null => {
          const url = byId.get(c.id);
          return url
            ? {
                characterId: c.id,
                name: c.name,
                portraitUrl: url,
                cached: true,
              }
            : null;
        })
        .filter((x): x is CastPortraitEntry => x !== null);
    });

    await markAwaitingCastApproval(jobId, {
      stage: "awaiting_cast_approval",
      storyId,
      portraits,
      aiPortraits,
      bgPortraits,
    });

    return { jobId, storyId, awaitingCastApproval: true };
  }
);

// Spec B: regenerate a single background portrait. Mirrors
// regenerateAiCastPortraitFn — owner-side state lives on
// story_backgrounds (description + optional user_prompt_addition).
export const regenerateBackgroundFn = inngest.createFunction(
  {
    id: "regenerate-background",
    name: "Regenerate one background portrait",
    retries: IMAGE_RETRIES,
    triggers: [{ event: EVENTS.backgroundRegenerate }],
    onFailure: async ({ event, error }) => onInngestFailure(event, error),
  },
  async ({ event, step }) => {
    const { jobId, storyId, bgId, promptAddition } = event.data as {
      jobId: string;
      storyId: string;
      bgId: string;
      promptAddition?: string;
    };
    await markRunning(jobId);

    await step.run("regen", async () => {
      const admin = supabaseAdmin();
      const { data: story } = await admin
        .from("stories")
        .select("art_style_id")
        .eq("id", storyId)
        .single<{ art_style_id: string }>();
      if (!story) throw new Error("story missing");

      const { data: row } = await admin
        .from("story_backgrounds")
        .select("*")
        .eq("id", bgId)
        .single<import("@/lib/types").Background>();
      if (!row) throw new Error("background row missing");

      const { data: style } = await admin
        .from("art_styles")
        .select("prompt_scaffold")
        .eq("id", story.art_style_id)
        .single<{ prompt_scaffold: string }>();
      if (!style) throw new Error("style missing");

      // Same prompt-addition handling as regenerateAiCastPortraitFn:
      // persist on the row before regenerating so a follow-up
      // regenerate (no override) replays the same prompt. Empty
      // string clears.
      const effectiveAddition =
        promptAddition === undefined
          ? row.user_prompt_addition
          : promptAddition;
      if (promptAddition !== undefined) {
        await admin
          .from("story_backgrounds")
          .update({ user_prompt_addition: promptAddition || null })
          .eq("id", bgId);
      }

      const dataUri = await generateBackgroundPortrait({
        label: row.label,
        description: row.description,
        userPromptAddition: effectiveAddition,
        artStylePromptScaffold: style.prompt_scaffold,
      });
      const portraitUrl = await uploadGeneratedImage(dataUri);

      const { error: updateErr } = await admin
        .from("story_backgrounds")
        .update({ portrait_url: portraitUrl })
        .eq("id", bgId);
      if (updateErr) {
        throw new Error(`background portrait update: ${updateErr.message}`);
      }

      await markDone(jobId, {
        stage: "background_regenerated",
        bgId,
        portraitUrl,
      });
    });
  }
);

// Insert a freshly-generated portrait, tolerating the UNIQUE
// (character_id, art_style_id) constraint when a concurrent worker
// raced us. On conflict we silently re-fetch the winning row's
// portrait_url — both stories converge on the same canonical portrait
// and neither retries. Returns lostRace=true when the caller's upload
// is orphaned in storage but the row already exists.
async function insertPortraitOrFetchWinner(
  admin: ReturnType<typeof supabaseAdmin>,
  args: { characterId: string; artStyleId: string; portraitUrl: string }
): Promise<{ portraitUrl: string; lostRace: boolean }> {
  const { error: insertErr } = await admin
    .from("character_portraits")
    .insert({
      character_id: args.characterId,
      art_style_id: args.artStyleId,
      portrait_url: args.portraitUrl,
    });
  if (!insertErr) {
    return { portraitUrl: args.portraitUrl, lostRace: false };
  }
  // 23505 = unique_violation. Anything else is a real failure we
  // must surface.
  if (insertErr.code !== "23505") {
    throw new Error(`portrait insert: ${insertErr.message}`);
  }
  const { data: winner, error: winnerErr } = await admin
    .from("character_portraits")
    .select("portrait_url")
    .eq("character_id", args.characterId)
    .eq("art_style_id", args.artStyleId)
    .maybeSingle<{ portrait_url: string }>();
  if (winnerErr || !winner) {
    throw new Error(
      `portrait insert conflict but no winner found: ${winnerErr?.message ?? "row vanished"}`
    );
  }
  return { portraitUrl: winner.portrait_url, lostRace: true };
}

export const allFunctions = [
  regenTextFn,
  assistTextFn,
  assistImageFn,
  assistInferFn,
  nightlyCleanupFn,
  generateStoryV2Fn,
  generatePagesAfterApprovalFn,
  regenerateCastPortraitFn,
  regenerateAiCastPortraitFn,
  regenerateBackgroundFn,
  regenerateScriptAfterRemovalFn,
];
