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
  entities jsonb,
  created_at timestamptz not null default now()
);

-- For databases created before the AI Studio feature, add the column.
alter table public.stories
  add column if not exists entities jsonb;

create index if not exists stories_created_at_idx
  on public.stories (created_at desc);

-- Row Level Security
-- The app currently uses the anon key from a Next.js route handler, so we
-- need a policy that lets it read and insert. Tighten this once real auth
-- is in place.
alter table public.stories enable row level security;

drop policy if exists "stories are publicly readable" on public.stories;
create policy "stories are publicly readable"
  on public.stories for select
  using (true);

drop policy if exists "anyone can insert stories" on public.stories;
create policy "anyone can insert stories"
  on public.stories for insert
  with check (true);

drop policy if exists "anyone can update stories" on public.stories;
create policy "anyone can update stories"
  on public.stories for update
  using (true)
  with check (true);

drop policy if exists "anyone can delete stories" on public.stories;
create policy "anyone can delete stories"
  on public.stories for delete
  using (true);

-- ---------------------------------------------------------------------------
-- Supabase Storage: "uploads" bucket policies
--
-- The Studio (Canvas editor) saves user-uploaded images and Gemini-generated
-- entity stickers to a Storage bucket called "uploads". Create the bucket
-- in the dashboard FIRST (Storage → New bucket → name "uploads", Public ON),
-- then run these policies. Marking a bucket public only enables READ — the
-- anon role still needs explicit policies to write/update/delete.
-- ---------------------------------------------------------------------------

drop policy if exists "anon can upload to uploads" on storage.objects;
create policy "anon can upload to uploads"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'uploads');

drop policy if exists "anon can update uploads" on storage.objects;
create policy "anon can update uploads"
  on storage.objects for update
  to anon
  using (bucket_id = 'uploads')
  with check (bucket_id = 'uploads');

drop policy if exists "anon can delete uploads" on storage.objects;
create policy "anon can delete uploads"
  on storage.objects for delete
  to anon
  using (bucket_id = 'uploads');
