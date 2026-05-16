# Story-Ink

An AI-powered children's storybook generator. Enter a prompt, pick a page count, and Gemini writes the story and illustrates every page. Stories are persisted to Supabase and readable in a slide-by-slide viewer.

Built on Next.js 16 (App Router), React 19, Tailwind 4, Supabase, and `@google/generative-ai`.

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Create a `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
GEMINI_API_KEY=your-gemini-api-key
```

### 3. Set up the database

StoryInk stores generated stories in a `public.stories` table (and several related tables). Before the app can save anything, you need to apply the database migrations.

Open the [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql) for your project, then run every file in [`supabase/migrations/`](./supabase/migrations/) **in numeric order**:

1. `000_schema.sql` — baseline schema (tables, indexes, RLS policies, RPCs).
2. `001_*.sql`, `002_*.sql`, … — incremental migrations. Apply each, in filename order.

Every migration file is idempotent (`create ... if not exists` / `create or replace function` / `drop policy if exists`), so re-running an already-applied file is safe.

> **Troubleshooting — `PGRST205: Could not find the table 'public.stories' in the schema cache`**
> This error means the migrations haven't been applied yet (or PostgREST's cache is stale). Run every file in `supabase/migrations/` as described above. If the error persists right after applying, click **"Reload schema cache"** in the Supabase dashboard or wait ~30 seconds for PostgREST to refresh.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project layout

- `src/app/page.tsx` — home page with the prompt form
- `src/app/api/generate/route.ts` — generation endpoint (Gemini + Supabase insert)
- `src/app/read/` — story list and `[id]` reader
- `src/components/SlideReader.tsx` — keyboard-navigable slide viewer
- `src/lib/gemini.ts` — Gemini text + image generation
- `src/lib/supabase.ts` — Supabase client
- `supabase/migrations/` — database schema baseline (`000_schema.sql`) + incremental migrations (`NNN_*.sql`)
