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
  generateCastPortrait,
  generatePageImageWithCastRefs,
  generateScript,
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

    const portraits: CastPortraitEntry[] = await step.run(
      "generate-cast-portraits",
      async () => {
        const admin = supabaseAdmin();

        const usedIds = new Set<string>();
        for (const p of script.pages)
          for (const id of p.characterIds) usedIds.add(id);
        const usedCast = ctx.cast.filter((c) => usedIds.has(c.id));

        return Promise.all(
          usedCast.map(async (c): Promise<CastPortraitEntry> => {
            const { data: existing } = await admin
              .from("character_portraits")
              .select("portrait_url")
              .eq("character_id", c.id)
              .eq("art_style_id", ctx.style.id)
              .maybeSingle<{ portrait_url: string }>();
            if (existing?.portrait_url) {
              return {
                characterId: c.id,
                name: c.name,
                portraitUrl: existing.portrait_url,
                cached: true,
              };
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
            if (insertErr)
              throw new Error(`portrait insert: ${insertErr.message}`);

            return {
              characterId: c.id,
              name: c.name,
              portraitUrl,
              cached: false,
            };
          })
        );
      }
    );

    await markAwaitingCastApproval(jobId, {
      stage: "awaiting_cast_approval",
      storyId,
      portraits,
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
        memories,
      };
    });

    const portraitByCharId = new Map<string, string>();
    for (const p of ctx.portraits)
      portraitByCharId.set(p.character_id, p.portrait_url);
    const nameByCharId = new Map<string, string>();
    for (const c of ctx.cast) nameByCharId.set(c.id, c.name);
    const memoryById = new Map<string, MemoryReference>();
    for (const m of ctx.memories) memoryById.set(m.id, m);

    const pages = ctx.story.script.pages;
    await Promise.all(
      pages.map((p) =>
        step.run(`generate-page-${p.pageNumber}`, async () => {
          const castOnPage = p.characterIds
            .map((id) => {
              const portraitUrl = portraitByCharId.get(id);
              const name = nameByCharId.get(id);
              return portraitUrl && name ? { name, portraitUrl } : null;
            })
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

          const dataUri = await generatePageImageWithCastRefs({
            sceneDescription: p.sceneDescription,
            artStylePromptScaffold: ctx.style.prompt_scaffold,
            castPortraitsOnPage: castOnPage,
            memoryRefsOnPage,
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

      // Delete + insert keeps the UNIQUE(character_id, art_style_id) index
      // honest under concurrent regen requests.
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

      await markDone(jobId, {
        stage: "regenerated",
        characterId,
        portraitUrl,
      });
    });
  }
);

export const allFunctions = [
  regenTextFn,
  assistTextFn,
  assistImageFn,
  assistInferFn,
  nightlyCleanupFn,
  generateStoryV2Fn,
  generatePagesAfterApprovalFn,
  regenerateCastPortraitFn,
];
