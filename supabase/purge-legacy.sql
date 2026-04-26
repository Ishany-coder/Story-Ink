-- One-shot purge of pre-auth data. Run this ONCE in the Supabase SQL
-- Editor before applying schema.sql in the new auth-aware shape.
--
-- Why: the auth migration adds NOT-NULL ish requirements to user_id on
-- new rows. Existing rows have user_id = NULL and would be invisible
-- to RLS-scoped reads going forward. Cleanest cut for a pre-launch
-- pivot is to wipe the slate and re-create as authenticated users.
--
-- Run order:
--   1) supabase/purge-legacy.sql   (this file)
--   2) supabase/schema.sql         (creates pets table + new RLS)
--
-- DESTRUCTIVE — this deletes every existing story, job, custom layout,
-- and print order. Storage objects in the "uploads" bucket are NOT
-- removed automatically; clean those via the Storage UI if you care.

delete from public.print_orders;
delete from public.custom_layouts;
delete from public.jobs;
delete from public.stories;
