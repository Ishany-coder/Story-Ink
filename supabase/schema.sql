-- StoryInk database schema
-- Run this in the Supabase SQL Editor (or via `supabase db execute`) to
-- create the table StoryInk expects. If you see PGRST205
-- ("Could not find the table 'public.stories' in the schema cache"),
-- it means this script hasn't been applied yet.

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  prompt text not null,
  page_count int not null check (page_count between 3 and 12),
  pages jsonb not null,
  cover_image text,
  created_at timestamptz not null default now()
);

-- Legacy columns removed when entity stickers and comic mode were dropped.
alter table public.stories drop column if exists entities;
alter table public.stories drop column if exists mode;

-- User-uploaded images attached to a story. Survives deleting the layer
-- that first referenced them, so the Studio's Images tab / picker keeps
-- showing them for reuse. Idempotent for existing deployments.
alter table public.stories
  add column if not exists library_images jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Jobs table — backs the Inngest-powered Gemini pipeline. HTTP routes insert
-- a row with status='queued' and send an Inngest event; the function writes
-- back `status`, `result`, and `error` as it runs. Clients poll
-- /api/jobs/[id] for progress.
-- ---------------------------------------------------------------------------

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null default 'queued',
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_created_at_idx
  on public.jobs (created_at desc);

alter table public.jobs enable row level security;

-- Anon needs to READ jobs so the client can poll /api/jobs/[id]. All
-- writes go through server routes using the service-role client, which
-- bypasses RLS, so the insert/update policies are intentionally absent.
drop policy if exists "jobs readable" on public.jobs;
create policy "jobs readable" on public.jobs for select using (true);

drop policy if exists "anyone can insert jobs" on public.jobs;
drop policy if exists "anyone can update jobs" on public.jobs;

-- Per-story AI assistant system prompt. Nullable because most stories
-- don't need one. When set, gets prepended to every text/image
-- regeneration request the user makes from the Assistant panel.
alter table public.stories
  add column if not exists ai_system_prompt text;

create index if not exists stories_created_at_idx
  on public.stories (created_at desc);

-- Row Level Security
-- Stories are public-read so server components (and the browser anon
-- client used for rendering lists/detail pages) can list them without
-- auth. Writes are NOT allowed from the anon key — every mutation goes
-- through a server route that uses the service-role client, which
-- bypasses RLS. This keeps "view only" access from the browser and
-- prevents a rogue script with the anon key from deleting other users'
-- stories.
alter table public.stories enable row level security;

drop policy if exists "stories are publicly readable" on public.stories;
create policy "stories are publicly readable"
  on public.stories for select
  using (true);

drop policy if exists "anyone can insert stories" on public.stories;
drop policy if exists "anyone can update stories" on public.stories;
drop policy if exists "anyone can delete stories" on public.stories;

-- ---------------------------------------------------------------------------
-- Supabase Storage: "uploads" bucket policies
--
-- The Studio saves user-uploaded images to a Storage bucket called "uploads".
-- Create the bucket in the dashboard FIRST (Storage → New bucket → name
-- "uploads", Public ON). Marking a bucket public only enables READ.
--
-- Writes go exclusively through /api/upload (and internal server helpers)
-- which use the service-role client and bypass RLS, so the anon role has
-- NO write policies. The previous "anon can upload/update/delete" policies
-- are dropped here for safety on existing deployments.
-- ---------------------------------------------------------------------------

drop policy if exists "anon can upload to uploads" on storage.objects;
drop policy if exists "anon can update uploads" on storage.objects;
drop policy if exists "anon can delete uploads" on storage.objects;

-- ---------------------------------------------------------------------------
-- Custom layouts
--
-- Users can save their own image/text region presets from the Studio. A row
-- with story_id = null is "global" (shown in every story's layout picker);
-- a row with story_id set is scoped to that single story. Deletes cascade
-- when the owning story is removed.
-- ---------------------------------------------------------------------------

create table if not exists public.custom_layouts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_region jsonb not null,
  text_region jsonb not null,
  -- Additional regions for multi-slot layouts. Stored as JSON arrays of
  -- Rect objects. Empty arrays by default so existing single-region
  -- layouts keep working unchanged.
  extra_image_regions jsonb not null default '[]'::jsonb,
  extra_text_regions jsonb not null default '[]'::jsonb,
  story_id uuid references public.stories(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- For existing deployments that already created the table without the two
-- "extra" columns, add them here (idempotent).
alter table public.custom_layouts
  add column if not exists extra_image_regions jsonb not null default '[]'::jsonb,
  add column if not exists extra_text_regions jsonb not null default '[]'::jsonb;

create index if not exists custom_layouts_story_id_idx
  on public.custom_layouts (story_id);
create index if not exists custom_layouts_global_idx
  on public.custom_layouts (created_at desc) where story_id is null;

alter table public.custom_layouts enable row level security;

-- Anon can list layouts (the Studio picker pulls global + per-story).
-- Mutations go through /api/custom-layouts using the service-role client.
drop policy if exists "custom layouts readable" on public.custom_layouts;
create policy "custom layouts readable"
  on public.custom_layouts for select
  using (true);

drop policy if exists "anyone can insert custom layouts" on public.custom_layouts;
drop policy if exists "anyone can update custom layouts" on public.custom_layouts;
drop policy if exists "anyone can delete custom layouts" on public.custom_layouts;

-- ---------------------------------------------------------------------------
-- Print orders (ship-a-storybook feature)
--
-- Tracks the state of physical-book orders so we can reconcile PayPal
-- captures with Lulu print jobs. Deliberately redacted — no shipping
-- address, no customer name, no email, no card details. The address is
-- sent straight to Lulu at order time and dropped from memory when the
-- request handler returns.
-- ---------------------------------------------------------------------------

create table if not exists public.print_orders (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  status text not null default 'pending',
  amount_usd numeric(10, 2),
  paypal_capture_id text,
  stripe_session_id text,
  lulu_print_job_id text,
  interior_pdf_url text,
  cover_pdf_url text,
  created_at timestamptz not null default now()
);

-- Idempotent add for existing deployments.
alter table public.print_orders
  add column if not exists stripe_session_id text;
create unique index if not exists print_orders_stripe_session_id_idx
  on public.print_orders (stripe_session_id) where stripe_session_id is not null;

create index if not exists print_orders_story_id_idx
  on public.print_orders (story_id);
create index if not exists print_orders_created_at_idx
  on public.print_orders (created_at desc);

alter table public.print_orders enable row level security;

-- Anon can read order status so the /ship success page can show the
-- current state by session id. Mutations happen server-side only
-- (Stripe webhook + confirm fallback) via the service-role client.
drop policy if exists "print orders readable" on public.print_orders;
create policy "print orders readable"
  on public.print_orders for select
  using (true);

drop policy if exists "anyone can insert print orders" on public.print_orders;
drop policy if exists "anyone can update print orders" on public.print_orders;

-- ---------------------------------------------------------------------------
-- Atomic per-page updater. Used by overlay saves and AI regeneration to
-- avoid a read-modify-write race on the entire stories.pages JSONB array
-- (two concurrent writers would otherwise drop one of the updates).
--
-- Takes a JSONB patch for a single page matched by pageNumber; merges the
-- patch into just that element's object and writes only that path back
-- via jsonb_set. The patch is shallow — top-level StoryPage fields only
-- (text, imageUrl, overlays, layoutId, narrationUrl, narrationCacheKey).
--
-- Security: SECURITY DEFINER so callers using the service-role key can
-- update; we do NOT grant execute to anon because all callers are
-- server-side code with the service-role client.
-- ---------------------------------------------------------------------------

create or replace function public.update_story_page_fields(
  p_story_id uuid,
  p_page_number int,
  p_patch jsonb
) returns void
language plpgsql
security definer
as $$
declare
  idx int;
  updated jsonb;
  current jsonb;
begin
  -- Find the array index of the element whose pageNumber matches. We
  -- iterate rather than relying on implicit ordering because the JSONB
  -- array may not be stored in page-number order.
  select position - 1
    into idx
    from stories s,
         jsonb_array_elements(s.pages) with ordinality as e(elem, position)
   where s.id = p_story_id
     and (elem->>'pageNumber')::int = p_page_number
   limit 1;

  if idx is null then
    raise exception 'Page % not found on story %', p_page_number, p_story_id
      using errcode = 'P0002';
  end if;

  select pages->idx into current from stories where id = p_story_id;
  updated := coalesce(current, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb);

  update stories
     set pages = jsonb_set(pages, array[idx::text], updated, false)
   where id = p_story_id;
end;
$$;

revoke all on function public.update_story_page_fields(uuid, int, jsonb) from public;
revoke all on function public.update_story_page_fields(uuid, int, jsonb) from anon;
