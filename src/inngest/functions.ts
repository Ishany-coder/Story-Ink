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
import { markDone, markFailed, markProgress, markRunning } from "@/lib/jobs";
import { reportError } from "@/lib/sentry";
import {
  assistRegenerateImage,
  assistRegenerateText,
  classifyAssistIntent,
  generatePageImage,
  generateStoryText,
  GeminiRateLimitError,
  GeminiSafetyBlockedError,
  regeneratePageText,
  type AssistTarget,
} from "@/lib/gemini";
import {
  supabaseAdmin,
  updateStoryPageFields,
  uploadGeneratedImage,
} from "@/lib/supabase";
import { buildInitialOverlays, DEFAULT_LAYOUT_ID } from "@/lib/layouts";
import {
  buildPetDescription,
  composePetStoryPrompt,
} from "@/lib/pet-prompt";
import {
  isValidStoryPageCount,
  MAX_STORY_PAGES,
  MIN_STORY_PAGES,
} from "@/lib/story-page-count";
import type { Layer, Pet, Story, StoryPage } from "@/lib/types";

const TEXT_RETRIES = 2;
const IMAGE_RETRIES = 3;

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

function isPageCountConstraintError(err: {
  message?: string;
  code?: string;
  constraint?: string;
} | null): boolean {
  // Postgres check-constraint violations surface as SQLSTATE 23514.
  // We still match on constraint/message because Supabase error payloads
  // can vary by client/runtime.
  if (err?.constraint === "stories_page_count_check") return true;
  if (err?.code === "23514" && err.message?.toLowerCase().includes("page_count")) {
    return true;
  }
  const message = err?.message?.toLowerCase() ?? "";
  return (
    message.includes("stories_page_count_check") ||
    (message.includes("page_count") && message.includes("check constraint"))
  );
}

type SaveStoryResult =
  | { storyId: string; fatalError: null }
  | { storyId: null; fatalError: string };

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
      "id, title, prompt, pages, ai_system_prompt, image_style, user_id"
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
        | "image_style"
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
// story/generate.requested — full "make me a story" pipeline.
// --------------------------------------------------------------------------

export const generateStoryFn = inngest.createFunction(
  {
    id: "generate-story",
    retries: IMAGE_RETRIES,
    triggers: [{ event: EVENTS.generateStory }],
    onFailure: async ({ event, error }) => onInngestFailure(event, error),
  },
  async ({ event, step }) => {
    const {
      jobId,
      userId,
      prompt,
      pageCount,
      kind = "generic",
      petId = null,
      imageMode = "quality",
      isPublic = false,
      imageStyle = "watercolor",
    } = event.data as {
      jobId: string;
      userId: string;
      prompt: string;
      pageCount: number;
      kind?: "pet" | "generic";
      petId?: string | null;
      imageMode?: "fast" | "quality";
      isPublic?: boolean;
      imageStyle?: string;
    };
    await step.run("mark-running", () => markRunning(jobId));

    // Pet stories pull the full pet row up front so subsequent steps
    // can reference its photos + personality without an extra fetch.
    const pet = await step.run("fetch-pet", async (): Promise<Pet | null> => {
      if (kind !== "pet" || !petId) return null;
      const { data, error } = await supabaseAdmin()
        .from("pets")
        .select("*")
        .eq("id", petId)
        .eq("user_id", userId)
        .maybeSingle<Pet>();
      if (error) {
        console.error("[inngest.generate] pet fetch failed:", error);
        return null;
      }
      return data ?? null;
    });

    // For pet stories, prepend the pet's profile to the user prompt so
    // the AI plans the story around the actual character. Generic
    // stories pass the prompt through unchanged.
    const composedPrompt = pet
      ? composePetStoryPrompt(prompt, pet)
      : prompt;
    const petDescription = pet ? buildPetDescription(pet) : null;
    const memorial = pet?.mode === "memorial";

    const scriptData = await step.run("plan-story", async () => {
      const storyText = await generateStoryText(composedPrompt, pageCount);
      return {
        title: storyText.title,
        pages: storyText.pages.map((p) => ({
          pageNumber: p.pageNumber,
          text: p.text,
        })),
      };
    });

    // Image generation strategy. For a pet story in Quality mode we
    // serialize pages so each one can pass the previous page's image
    // AND the first page's image back to Gemini — that's how we lock
    // the character's look across the whole book instead of letting it
    // drift page-to-page. Fast mode (and all generic stories) fan out
    // in parallel and only use reference photos.
    const imageContextBase = {
      referencePhotos: pet?.photos ?? [],
      petDescription,
      memorial,
      styleId: imageStyle,
    };

    let imageUrls: string[];
    if (kind === "pet" && imageMode === "quality") {
      imageUrls = [];
      let firstPageUrl: string | null = null;
      for (const p of scriptData.pages) {
        await step.run(`progress-${p.pageNumber}`, () =>
          markProgress(jobId, {
            current: p.pageNumber,
            total: scriptData.pages.length,
            phase: "image",
          })
        );
        const previousPageUrl =
          imageUrls.length > 0 ? imageUrls[imageUrls.length - 1] || null : null;
        // Page 1 has no anchor yet — the photos do the grounding. Page
        // 2..N pass page 1 (canonical) AND the immediately-previous
        // page (style continuity), which bounds drift.
        const isFirstPage = imageUrls.length === 0;
        const url: string = await step
          .run(`generate-page-image-${p.pageNumber}`, async () => {
            const dataUri = await generatePageImage(p.text, scriptData.title, {
              ...imageContextBase,
              firstPageUrl: isFirstPage ? null : firstPageUrl,
              previousPageUrl,
            });
            if (!dataUri) return "";
            try {
              return await uploadGeneratedImage(dataUri);
            } catch (err) {
              console.error(
                `[inngest.generate] page ${p.pageNumber} upload failed:`,
                err
              );
              return "";
            }
          })
          .catch((err: unknown) => {
            console.error(
              `[inngest.generate] page ${p.pageNumber} gave up after retries:`,
              err
            );
            return "";
          });
        imageUrls.push(url);
        if (isFirstPage && url) firstPageUrl = url;
      }
    } else {
      imageUrls = await Promise.all(
        scriptData.pages.map((p) =>
          step
            .run(`generate-page-image-${p.pageNumber}`, async () => {
              const dataUri = await generatePageImage(
                p.text,
                scriptData.title,
                imageContextBase
              );
              if (!dataUri) return "";
              try {
                return await uploadGeneratedImage(dataUri);
              } catch (err) {
                console.error(
                  `[inngest.generate] page ${p.pageNumber} upload failed:`,
                  err
                );
                return "";
              }
            })
            .catch((err: unknown) => {
              console.error(
                `[inngest.generate] page ${p.pageNumber} gave up after retries:`,
                err
              );
              return "";
            })
        )
      );
    }

    const pages: StoryPage[] = scriptData.pages.map((page, i) => {
      const imageUrl = imageUrls[i];
      return {
        pageNumber: page.pageNumber,
        text: page.text,
        imageUrl,
        layoutId: DEFAULT_LAYOUT_ID,
        overlays: buildInitialOverlays(imageUrl, page.text),
      };
    });

    await step.run("save-recovery-payload", async () => {
      try {
        await markProgress(jobId, {
          phase: "save",
          generatedStory: {
            title: scriptData.title,
            prompt,
            pageCount,
            pages,
            coverImage: pages[0]?.imageUrl || null,
            kind,
            petId,
            imageStyle,
            isPublic,
          },
        });
      } catch (err) {
        // Best-effort only: save-story should still run even if this
        // progress write fails, so we can avoid losing the story.
        console.error("[inngest.generate] failed to persist recovery payload:", err);
      }
    });

    const saveResult = await step.run("save-story", async (): Promise<SaveStoryResult> => {
      if (!isValidStoryPageCount(pageCount)) {
        return {
          storyId: null,
          fatalError: `Story generation requested ${pageCount} pages, but the current supported range is ${MIN_STORY_PAGES}-${MAX_STORY_PAGES}. This may indicate a configuration change — please contact support with your job ID.`,
        };
      }
      if (pages.length !== pageCount) {
        return {
          storyId: null,
          fatalError: `Story generation produced ${pages.length} pages but expected ${pageCount}. This indicates a generation bug — please contact support with your job ID.`,
        };
      }

      const { data, error } = await supabaseAdmin()
        .from("stories")
        .insert({
          title: scriptData.title,
          prompt,
          page_count: pageCount,
          pages,
          cover_image: pages[0]?.imageUrl || null,
          user_id: userId,
          is_public: isPublic,
          kind,
          pet_id: petId,
          image_style: imageStyle,
        })
        .select("id")
        .single();

      if (error || !data) {
        if (isPageCountConstraintError(error)) {
          return {
            storyId: null,
            fatalError:
              "Your story was generated, but saving failed because the database page-count rule is out of date. Please ask support to rerun supabase/schema.sql and retry save.",
          };
        }
        throw new Error(`Supabase insert failed: ${error?.message}`);
      }

      return { storyId: data.id as string, fatalError: null };
    });

    if (!saveResult.storyId) {
      await step.run("mark-save-failed", () =>
        markFailed(jobId, saveResult.fatalError)
      );
      return { storyId: null, error: saveResult.fatalError };
    }

    await step.run("mark-done", () => markDone(jobId, { storyId: saveResult.storyId }));
    return { storyId: saveResult.storyId };
  }
);

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

    const imageUrl = await step.run("generate-and-upload", async () => {
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
        styleId: story.image_style ?? null,
      });
      return uploadGeneratedImage(dataUri);
    });

    await step.run("mark-done", () =>
      markDone(jobId, { targets: ["image"], text: null, imageUrl })
    );
    return { imageUrl };
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

    const [text, imageUrl] = await Promise.all([
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
                styleId: story.image_style ?? null,
              });
              return uploadGeneratedImage(dataUri);
            })
            .catch((err: unknown) => {
              console.error("[inngest.infer] image failed:", err);
              return null;
            })
        : Promise.resolve(null),
    ]);

    await step.run("mark-done", () =>
      markDone(jobId, { targets, text, imageUrl })
    );
    return { targets, text, imageUrl };
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

export const allFunctions = [
  generateStoryFn,
  regenTextFn,
  assistTextFn,
  assistImageFn,
  assistInferFn,
  nightlyCleanupFn,
];
