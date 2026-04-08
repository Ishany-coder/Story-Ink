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

StoryInk stores generated stories in a `public.stories` table. Before the app can save anything, you need to create it.

Open the [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql) for your project, paste the contents of [`supabase/schema.sql`](./supabase/schema.sql), and run it. This creates the table, an index on `created_at`, and permissive RLS policies so the anon key can read and insert.

> **Troubleshooting — `PGRST205: Could not find the table 'public.stories' in the schema cache`**
> This error means the schema script hasn't been applied yet (or PostgREST's cache is stale). Run `supabase/schema.sql` as described above. If the error persists right after creating the table, click **"Reload schema cache"** in the Supabase dashboard or wait ~30 seconds for PostgREST to refresh.

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
- `supabase/schema.sql` — database schema
