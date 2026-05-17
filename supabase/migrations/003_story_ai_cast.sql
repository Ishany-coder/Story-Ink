-- AI-cast members: supporting characters invented by the script
-- generator when the user's manually-supplied cast isn't enough.
-- Each row owns its own portrait_url (not deduped via
-- character_portraits — the AI description is per-story, so cache
-- reuse across stories isn't safe).
--
-- The user can rename, regenerate (with optional prompt addition),
-- or remove these via the approval gate. Remove triggers a Stage 1
-- re-run with the name excluded; the new script may surface a
-- different AI cast list.
--
-- RLS is gated by ownership of the parent story.
create table if not exists public.story_ai_cast (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  -- Display name. Initially set by the script generator, editable by
  -- the user via the approval gate (rename doesn't trigger regen).
  name text not null,
  -- Optional role descriptor inferred by Stage 1.5 (e.g. "the
  -- bride's father"). Used for display only.
  role_label text,
  kind text not null check (kind in ('person', 'pet')),
  -- Script-derived appearance description (age, build, hair,
  -- distinguishing features). Drives portrait generation.
  description text not null,
  -- Optional user addition typed via the approval-gate pencil
  -- icon. Concatenated with `description` at portrait-gen time.
  user_prompt_addition text,
  portrait_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists story_ai_cast_story_idx
  on public.story_ai_cast (story_id);

alter table public.story_ai_cast enable row level security;

drop policy if exists "story ai cast readable by owner"
  on public.story_ai_cast;
create policy "story ai cast readable by owner"
  on public.story_ai_cast for select
  using (
    exists (
      select 1 from public.stories s
      where s.id = story_ai_cast.story_id
        and s.user_id = auth.uid()
    )
  );

drop policy if exists "story ai cast modifiable by owner"
  on public.story_ai_cast;
create policy "story ai cast modifiable by owner"
  on public.story_ai_cast for all
  using (
    exists (
      select 1 from public.stories s
      where s.id = story_ai_cast.story_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.stories s
      where s.id = story_ai_cast.story_id
        and s.user_id = auth.uid()
    )
  );

-- Auto-bump updated_at on any row update.
create or replace function public.touch_story_ai_cast_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_story_ai_cast_updated_at on public.story_ai_cast;
create trigger trg_story_ai_cast_updated_at
  before update on public.story_ai_cast
  for each row execute function public.touch_story_ai_cast_updated_at();
