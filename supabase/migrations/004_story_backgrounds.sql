-- Canonical backgrounds: one row per distinct location used in a
-- story (e.g. "the park", "Sarah's kitchen", "the wedding venue").
-- Each row owns its own portrait_url — the wide-angle establishing
-- illustration that Stage 3 attaches as a visual anchor on every
-- page set in this location.
--
-- The user can rename, regenerate (with optional prompt addition),
-- or remove these via the approval gate. Remove triggers a Stage 1
-- re-run with the label added to excludedBackgroundLabels; the new
-- script may surface a different set of backgrounds.
--
-- Mirrors the shape + RLS of story_ai_cast (migration 003).
create table if not exists public.story_backgrounds (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  -- Display label. Initially set by Stage 1 (the script generator),
  -- editable by the user via the approval gate. Rename also patches
  -- every page's `setting` in stories.script so script + backgrounds
  -- stay in sync.
  label text not null,
  -- Script-derived stable description (geography, landmarks,
  -- structures, palette, general mood). Drives portrait generation.
  -- Does NOT include scene-specific details like characters or
  -- per-page lighting — those vary per page and are handled by the
  -- per-page text prompt.
  description text not null,
  -- Optional user addition typed via the approval-gate pencil
  -- icon. Appended verbatim to the portrait prompt.
  user_prompt_addition text,
  portrait_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists story_backgrounds_story_idx
  on public.story_backgrounds (story_id);

alter table public.story_backgrounds enable row level security;

drop policy if exists "story backgrounds readable by owner"
  on public.story_backgrounds;
create policy "story backgrounds readable by owner"
  on public.story_backgrounds for select
  using (
    exists (
      select 1 from public.stories s
      where s.id = story_backgrounds.story_id
        and s.user_id = auth.uid()
    )
  );

drop policy if exists "story backgrounds modifiable by owner"
  on public.story_backgrounds;
create policy "story backgrounds modifiable by owner"
  on public.story_backgrounds for all
  using (
    exists (
      select 1 from public.stories s
      where s.id = story_backgrounds.story_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.stories s
      where s.id = story_backgrounds.story_id
        and s.user_id = auth.uid()
    )
  );

-- Auto-bump updated_at on any row update. Trigger function lives
-- under a per-table name to keep migration 003's function isolated.
create or replace function public.touch_story_backgrounds_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_story_backgrounds_updated_at on public.story_backgrounds;
create trigger trg_story_backgrounds_updated_at
  before update on public.story_backgrounds
  for each row execute function public.touch_story_backgrounds_updated_at();
