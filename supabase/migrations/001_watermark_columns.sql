-- Migration 001 — StoryInk watermark on page + cover images.
--
-- Adds the storage for the "watermarked" sibling URLs that pair with
-- the canonical, unwatermarked image. The reader, canvas editor, and
-- library tiles pick the watermarked variant when the viewer hasn't
-- paid for the story; the print PDF and the editor's save path
-- continue to read the canonical URL.
--
-- Safe to re-run: every statement uses `if not exists` / `create or
-- replace`. Run order is independent of other migrations.
--
-- Apply:
--   psql "$DATABASE_URL" -f supabase/migrations/001_watermark_columns.sql
--   (or paste into the Supabase Studio SQL editor)

-- 1. Watermarked cover variant on stories.
--    Populated by the Inngest set-cover step alongside `cover_image`
--    (which stays unwatermarked so the print PDF embeds the clean
--    image). Library tiles, sample gallery, and OG image renderers
--    pick this when the viewer does not have full access.
alter table public.stories
  add column if not exists cover_image_watermarked text;

-- 2. Allow `watermarkedImageUrl` in the page-patch whitelist.
--    The `update_story_page_fields` RPC filters incoming JSONB keys
--    to a safe set; the per-page Inngest step and the AI assist
--    routes need to be able to write the watermarked sibling URL
--    onto stories.pages[i].watermarkedImageUrl.
--
--    Body mirrors the canonical version in schema.sql verbatim,
--    only adding the `watermarkedImageUrl` whitelist clause.
create or replace function public.update_story_page_fields(
  p_story_id uuid,
  p_page_number int,
  p_patch jsonb
) returns void
language plpgsql
security definer
-- Pin search_path so a malicious schema in front of public can't shadow
-- the stories table or jsonb operators when this SECURITY DEFINER runs.
set search_path = public, pg_temp
as $$
declare
  v_idx int;
  v_merged jsonb;
  v_current jsonb;
  v_owner uuid;
  v_caller uuid;
  v_safe_patch jsonb;
begin
  -- Ownership gate. Service-role callers have auth.uid() = null and
  -- pass through (the application layer has already done its checks).
  -- Any other caller must own the story.
  v_caller := auth.uid();
  select user_id into v_owner from public.stories where id = p_story_id;
  if v_owner is null then
    raise exception 'Story % not found', p_story_id using errcode = 'P0002';
  end if;
  if v_caller is not null and v_caller <> v_owner then
    raise exception 'Not authorized to modify story %', p_story_id
      using errcode = '42501';
  end if;

  -- Whitelist patch keys — refuse to merge anything the app doesn't
  -- expect (defense in depth against schema-bloat attacks).
  v_safe_patch := '{}'::jsonb;
  if p_patch ? 'text' then
    v_safe_patch := v_safe_patch || jsonb_build_object('text', p_patch->'text');
  end if;
  if p_patch ? 'imageUrl' then
    v_safe_patch := v_safe_patch || jsonb_build_object('imageUrl', p_patch->'imageUrl');
  end if;
  if p_patch ? 'watermarkedImageUrl' then
    v_safe_patch := v_safe_patch
      || jsonb_build_object('watermarkedImageUrl', p_patch->'watermarkedImageUrl');
  end if;
  if p_patch ? 'overlays' then
    v_safe_patch := v_safe_patch || jsonb_build_object('overlays', p_patch->'overlays');
  end if;
  if p_patch ? 'layoutId' then
    v_safe_patch := v_safe_patch || jsonb_build_object('layoutId', p_patch->'layoutId');
  end if;

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
  v_merged := coalesce(v_current, '{}'::jsonb) || v_safe_patch;

  update public.stories
     set pages = jsonb_set(pages, array[v_idx::text], v_merged, false)
   where id = p_story_id;
end;
$$;
