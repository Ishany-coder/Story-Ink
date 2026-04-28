# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Stack

Next.js 16 App Router, React 19, Tailwind 4, TypeScript (strict). Supabase (Postgres + Auth + Storage) via `@supabase/ssr` and `@supabase/supabase-js`. AI via `@google/generative-ai` (Gemini text + image). Async work via Inngest. Print fulfillment via Stripe Checkout + Lulu Direct + `pdf-lib`. `@/*` path alias maps to `src/*`.

> Heed the AGENTS.md warning: this is **Next.js 16**, not the version in your training data. App Router conventions, params, and APIs may differ — read `node_modules/next/dist/docs/` before touching framework-specific code.

## Commands

```
npm install
npm run dev      # next dev (port 3000)
npm run build    # next build
npm run lint     # eslint (uses eslint-config-next)
npm run start    # next start (production)
```

There is no test runner configured.

**Local dev requires two processes:**

1. `npm run dev`
2. `npx inngest-cli@latest dev` — the Inngest dev server. It auto-discovers `/api/inngest` and serves a UI at http://localhost:8288. Without it, story generation will sit in `queued` forever because nothing executes the functions in `src/inngest/functions.ts`.

## Environment

`.env.local` keys actually consumed by the code:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; required for any DB write that bypasses RLS, all Storage uploads, and all Inngest functions
- `GEMINI_API_KEY`
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` — production only; dev mode is auto-detected via `NODE_ENV`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `LULU_CLIENT_KEY`, `LULU_CLIENT_SECRET`, `LULU_ENV` (`production` | unset for sandbox), optional `LULU_PRODUCT_SKU`
- `ALLOWED_IMAGE_HOSTS` — optional comma-separated extension to the SSRF allowlist (`isAllowedContentUrl`)

## Database

Schema lives in `supabase/schema.sql` and is **idempotent** — re-run it after edits. Tables: `pets`, `stories`, `jobs`, `custom_layouts`, `print_orders`. All are RLS-scoped to `auth.uid()`; public reads are gated by an `is_public` column where it makes sense (`stories`, `pets`).

Storage bucket: `uploads` (public read, writes only via service role).

**`update_story_page_fields(story_id, page_number, patch)`** is a `security definer` RPC and the only correct way to mutate a single page inside the `stories.pages` JSONB array. The Studio (drag/drop overlays) and the AI assistant (text/image regen) write concurrently to different pages of the same story — a read-modify-write of the whole array would clobber. Use `updateStoryPageFields()` from `src/lib/supabase.ts`.

## Architecture

### Two Supabase clients — keep them separate

- `src/lib/supabase.ts` exports `supabase` (anon) and `supabaseAdmin()` (service role, lazy). Admin **bypasses RLS** and is **server-only** — never import this file's `supabaseAdmin` into a `"use client"` module.
- `src/lib/supabase-server.ts` exports `getSupabaseServer()` / `getCurrentUser()` / `requireUser()` / `assertOwnsStory()` for server components and route handlers that need to act *as the signed-in user* (so RLS scopes the query).
- `src/lib/supabase-browser.ts` exports a singleton client component browser client.

`src/middleware.ts` runs on every non-static path and calls `supabase.auth.getUser()` purely for its side effect of refreshing the session cookie. Don't remove that call.

### Async generation pipeline (Inngest + jobs table)

Every long-running Gemini call goes through Inngest, never inline in a route handler:

1. HTTP route (`POST /api/generate`, `/api/stories/[id]/...`) authenticates, validates input, calls `createJob()` to insert a `jobs` row (`status: "queued"`), then `inngest.send({ name: ... })`. Returns the `jobId` with `202`.
2. Inngest invokes the matching function in `src/inngest/functions.ts`. Each function uses `step.run(...)` so each unit of work retries independently on Gemini 429s, Supabase ECONNRESETs, etc. The function moves the job through `running` → `done` (with a `result` payload) or `failed` (with an `error`). `onFailure` handlers exist on every function so an exhausted retry budget still marks the job failed.
3. Client polls `GET /api/jobs/[id]` via `src/lib/useJobPolling.ts` until terminal.

Event names are centralized in `src/inngest/client.ts` as the `EVENTS` const — import from there, don't string-literal them at send sites.

The full registration list lives in `allFunctions` (`src/inngest/functions.ts`) and is served by `src/app/api/inngest/route.ts` using `inngest/next`'s `serve`.

### Story generation specifics

`generateStoryFn` has two image-generation strategies controlled by `imageMode`:

- **`quality`** (default for pet stories) — pages are generated **serially**. Page 1 is the canonical character sheet; page 2..N pass page 1 *and* the immediately-previous page back to Gemini as inline image context. This is the difference between "a real keepsake" and "the dog turns into a different dog by page 4." See the prompt construction in `generatePageImage` (`src/lib/gemini.ts`).
- **`fast`** (and all generic stories) — pages fan out in parallel using only the pet's reference photos.

Pet stories also prepend `buildPetStorySystemPrompt(pet)` (`src/lib/pet-prompt.ts`) to the user's idea before `generateStoryText`. Memorial-mode pets get specific guardrails (no peril, two valid narrative paths: recollection vs. Rainbow Bridge — never blended). Living-mode pets get adventure tone. Quirks from `quirk-bank.ts` are rendered as Q&A so a single quirk can drive an entire page.

### Studio / Canvas editor

`src/components/CanvasEditor.tsx` is the Canva-style editor. Pages have `overlays` of typed `Layer`s (`text` | `shape` | `image`), each tagged with `source: "layout" | "user"`. **Layout layers are placed by a preset; user layers are added by hand and survive layout changes.** All coordinates live in `CANVAS_SIZE`-logical pixels (`src/lib/types.ts`) and are rendered scaled.

`src/lib/layouts.ts` owns the preset list, default layout id, layout morph engine (`morphLayersToLayout`), and the synthesizer (`resolveDisplayLayers`) that fakes layout layers for legacy pages that pre-date overlays. Custom user-defined layouts come from `public.custom_layouts`. The `modeFilter: "memorial"` flag hides the "in loving memory" preset from non-memorial stories.

### AI Assistant flow

`/api/stories/[id]/ai/infer` (and the explicit `text` / `image` variants) drive the per-page AI editor in the Studio. The infer path runs an intent classifier (`classifyAssistIntent` on flash) to pick targets `["text"]` / `["image"]` / `["text","image"]` and then dispatches text and/or image regeneration in parallel. Anything that could change a character/setting/action falls back to both. `GeminiRateLimitError` from the classifier short-circuits to "both" instead of cascading retries.

Two system prompt layers concat into every assistant call: a **global** prompt the user sets in browser localStorage and a **per-story** `stories.ai_system_prompt`. Routes compose with `composeSystemPrompt(global, perStory)` — global first.

### Print + ship pipeline

1. `POST /api/ship/quote` → `quotePrintAndShipping()` (`src/lib/lulu.ts`) returns a Lulu cost calc the customer sees.
2. `POST /api/ship/stripe/...` opens a Stripe Checkout session with the address packed into session metadata (`packAddressMetadata` — single `address` key under Stripe's 500-char metadata limit).
3. Fulfillment runs via `fulfillFromSession()` (`src/lib/ship-fulfill.ts`), called from **two** entry points: the signature-verified webhook (authoritative in prod) and an opportunistic `confirm` route hit by the success page (safety net + dev convenience).

Idempotency lives in three places that must stay aligned: a unique index on `print_orders.stripe_session_id`, an existing-row check, and an atomic CAS update from `paid → processing` (`update().eq("status","paid")` returning rows-affected). Two concurrent fulfillers cannot create two Lulu print jobs.

Print PDFs are built by `pdf-lib` in `src/lib/print-pdf.ts`. Trim is 8.5×8.5 with 0.125" bleed; minimum 24 interior pages (Lulu hardcover requirement) padded with blanks. Memorial stories add front + back dedication pages; the page count returned for spine math reflects them.

### SSRF-sensitive code paths

Anything that fetches a URL pulled from the `stories` table (image inputs to Gemini for character grounding, image embeds in print PDFs) **must** gate the URL through `isAllowedContentUrl()` from `src/lib/http.ts`. The current call sites are `fetchImageAsInlineData` (`src/lib/gemini.ts`) and `fetchImageBytes` (`src/lib/print-pdf.ts`). Don't add a new outbound fetch on a user-influenceable URL without that guard, or extending the allowlist.

### Auth gating cheatsheet

- Server component / route handler that reads as the user → `getCurrentUser()` / `requireUser()`
- Route handler that needs unrestricted writes (jobs, storage uploads, fulfillment) → `supabaseAdmin()`
- Inngest functions never have a session — they always use `supabaseAdmin()`
- Story-scoped routes → `assertOwnsStory(storyId, userId)` returns a `NextResponse` (404/403) on failure or `null` to continue
