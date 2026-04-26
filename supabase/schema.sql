-- StoryInk database schema
-- Run this in the Supabase SQL Editor (or via `supabase db execute`).
--
-- All tables are user-scoped via auth.users.id (Supabase Auth). Reads
-- of stories are allowed when the row is marked public; everything
-- else (private rows, all writes) requires the row's owner.
--
-- Idempotent: re-running this script is safe.

-- ---------------------------------------------------------------------------
-- Pets
-- ---------------------------------------------------------------------------

create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  species text not null check (species in (
    'dog','cat','bird','rabbit','horse','reptile','fish','other'
  )),
  breed text,
  age text,
  -- Free-form notes the AI seeds into every story prompt for this pet.
  -- Kept as one text blob (vs. structured fields) so the user can write
  -- whatever feels natural — "loves the mailman, hates baths, sleeps on
  -- my pillow." Token cost on Gemini is fine at <500 chars.
  personality_notes text,
  -- "living" pets get adventure-tone stories; "memorial" pets get
  -- celebratory recollection stories with softer guardrails.
  mode text not null default 'living' check (mode in ('living','memorial')),
  passed_at date,
  -- Reference photo URLs. Capped to 10 in the API to keep token cost
  -- and image-grounding latency reasonable.
  photos jsonb not null default '[]'::jsonb,
  -- Optional override for the templated memorial dedication page on
  -- printed memorial books. NULL → use the template "In loving memory
  -- of {name}, {dates}".
  dedication_text text,
  -- Per-pet visibility. Independent of any story's is_public — a pet
  -- can stay private even if some of its stories are public.
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotent for existing deployments that pre-date this column.
alter table public.pets add column if not exists dedication_text text;

create index if not exists pets_user_id_idx on public.pets (user_id);
create index if not exists pets_created_at_idx on public.pets (created_at desc);

alter table public.pets enable row level security;

drop policy if exists "pets visible to owner or public" on public.pets;
create policy "pets visible to owner or public"
  on public.pets for select
  using (is_public or user_id = auth.uid());

drop policy if exists "pets insert by owner" on public.pets;
create policy "pets insert by owner"
  on public.pets for insert
  with check (user_id = auth.uid());

drop policy if exists "pets update by owner" on public.pets;
create policy "pets update by owner"
  on public.pets for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "pets delete by owner" on public.pets;
create policy "pets delete by owner"
  on public.pets for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Stories
-- ---------------------------------------------------------------------------

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

alter table public.stories
  add column if not exists library_images jsonb not null default '[]'::jsonb;

alter table public.stories
  add column if not exists ai_system_prompt text;

-- Ownership + privacy + optional pet link. user_id is required for all
-- new rows; existing pre-auth rows would be NULL — the legacy purge
-- script clears the table before this migration runs in fresh setups.
alter table public.stories
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists is_public boolean not null default false,
  add column if not exists pet_id uuid references public.pets(id) on delete set null,
  -- "pet" stories use the pet's profile + photos; "generic" stories
  -- preserve the original freeform creation flow without a pet.
  add column if not exists kind text not null default 'generic'
    check (kind in ('pet','generic'));

create index if not exists stories_created_at_idx on public.stories (created_at desc);
create index if not exists stories_user_id_idx on public.stories (user_id);
create index if not exists stories_pet_id_idx on public.stories (pet_id);
create index if not exists stories_public_idx
  on public.stories (created_at desc) where is_public;

alter table public.stories enable row level security;

drop policy if exists "stories are publicly readable" on public.stories;
drop policy if exists "anyone can insert stories" on public.stories;
drop policy if exists "anyone can update stories" on public.stories;
drop policy if exists "anyone can delete stories" on public.stories;

drop policy if exists "stories visible to owner or public" on public.stories;
create policy "stories visible to owner or public"
  on public.stories for select
  using (is_public or user_id = auth.uid());

drop policy if exists "stories insert by owner" on public.stories;
create policy "stories insert by owner"
  on public.stories for insert
  with check (user_id = auth.uid());

drop policy if exists "stories update by owner" on public.stories;
create policy "stories update by owner"
  on public.stories for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "stories delete by owner" on public.stories;
create policy "stories delete by owner"
  on public.stories for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Jobs
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

-- Jobs belong to a user so the polling endpoint scopes results to
-- the requester. Inngest functions write via the service-role client
-- so they don't need explicit policies.
alter table public.jobs
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists jobs_created_at_idx on public.jobs (created_at desc);
create index if not exists jobs_user_id_idx on public.jobs (user_id);

alter table public.jobs enable row level security;

drop policy if exists "jobs readable" on public.jobs;
drop policy if exists "anyone can insert jobs" on public.jobs;
drop policy if exists "anyone can update jobs" on public.jobs;

drop policy if exists "jobs readable by owner" on public.jobs;
create policy "jobs readable by owner"
  on public.jobs for select
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: "uploads" bucket
--
-- Public-read. All writes go through /api/upload and internal helpers
-- using the service-role client, so anon has no write policies.
-- ---------------------------------------------------------------------------

drop policy if exists "anon can upload to uploads" on storage.objects;
drop policy if exists "anon can update uploads" on storage.objects;
drop policy if exists "anon can delete uploads" on storage.objects;

-- ---------------------------------------------------------------------------
-- Custom layouts
-- ---------------------------------------------------------------------------

create table if not exists public.custom_layouts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_region jsonb not null,
  text_region jsonb not null,
  extra_image_regions jsonb not null default '[]'::jsonb,
  extra_text_regions jsonb not null default '[]'::jsonb,
  story_id uuid references public.stories(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.custom_layouts
  add column if not exists extra_image_regions jsonb not null default '[]'::jsonb,
  add column if not exists extra_text_regions jsonb not null default '[]'::jsonb,
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists custom_layouts_story_id_idx
  on public.custom_layouts (story_id);
create index if not exists custom_layouts_global_idx
  on public.custom_layouts (created_at desc) where story_id is null;
create index if not exists custom_layouts_user_id_idx
  on public.custom_layouts (user_id);

alter table public.custom_layouts enable row level security;

drop policy if exists "custom layouts readable" on public.custom_layouts;
drop policy if exists "anyone can insert custom layouts" on public.custom_layouts;
drop policy if exists "anyone can update custom layouts" on public.custom_layouts;
drop policy if exists "anyone can delete custom layouts" on public.custom_layouts;

-- A layout is visible if (a) you own it, or (b) it's a global layout
-- with no owner (legacy / built-in shared presets).
drop policy if exists "custom layouts visible to owner" on public.custom_layouts;
create policy "custom layouts visible to owner"
  on public.custom_layouts for select
  using (user_id = auth.uid() or user_id is null);

drop policy if exists "custom layouts insert by owner" on public.custom_layouts;
create policy "custom layouts insert by owner"
  on public.custom_layouts for insert
  with check (user_id = auth.uid());

drop policy if exists "custom layouts update by owner" on public.custom_layouts;
create policy "custom layouts update by owner"
  on public.custom_layouts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "custom layouts delete by owner" on public.custom_layouts;
create policy "custom layouts delete by owner"
  on public.custom_layouts for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Print orders
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

alter table public.print_orders
  add column if not exists stripe_session_id text,
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists print_orders_stripe_session_id_idx
  on public.print_orders (stripe_session_id) where stripe_session_id is not null;

create index if not exists print_orders_story_id_idx on public.print_orders (story_id);
create index if not exists print_orders_user_id_idx on public.print_orders (user_id);
create index if not exists print_orders_created_at_idx on public.print_orders (created_at desc);

alter table public.print_orders enable row level security;

drop policy if exists "print orders readable" on public.print_orders;
drop policy if exists "anyone can insert print orders" on public.print_orders;
drop policy if exists "anyone can update print orders" on public.print_orders;

drop policy if exists "print orders readable by owner" on public.print_orders;
create policy "print orders readable by owner"
  on public.print_orders for select
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Atomic per-page updater (unchanged from previous schema). Used by
-- overlay saves and AI regeneration to avoid a read-modify-write race
-- on the entire stories.pages JSONB array.
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
  v_idx int;
  v_merged jsonb;
  v_current jsonb;
begin
  select pos - 1
    into v_idx
    from public.stories s,
         jsonb_array_elements(s.pages) with ordinality as e(elem, pos)
   where s.id = p_story_id
     and (elem->>'pageNumber')::int = p_page_number
   limit 1;

  if v_idx is null then
    raise exception 'Page % not found on story %', p_page_number, p_story_id
      using errcode = 'P0002';
  end if;

  select pages->v_idx into v_current from public.stories where id = p_story_id;
  v_merged := coalesce(v_current, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb);

  update public.stories
     set pages = jsonb_set(pages, array[v_idx::text], v_merged, false)
   where id = p_story_id;
end;
$$;

revoke all on function public.update_story_page_fields(uuid, int, jsonb) from public;
revoke all on function public.update_story_page_fields(uuid, int, jsonb) from anon;
