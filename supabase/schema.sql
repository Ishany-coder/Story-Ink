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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotent for existing deployments that pre-date this column.
alter table public.pets add column if not exists dedication_text text;

-- The pet `is_public` flag was removed (pets are always private now —
-- story-level sharing via stories.is_public is the only shareable
-- axis). Drop the column from deployed DBs when ready.
alter table public.pets drop column if exists is_public;

-- Structured "personality DNA" — a list of {prompt, answer} entries
-- the user fills out from a curated bank of specific quirk
-- questions ("Does she tilt her head?", "Where does he sleep?").
-- Stored as JSONB so the bank can grow without a schema change;
-- the Pet type narrows the shape on the application side.
alter table public.pets
  add column if not exists quirks jsonb not null default '[]'::jsonb;

create index if not exists pets_user_id_idx on public.pets (user_id);
create index if not exists pets_created_at_idx on public.pets (created_at desc);

alter table public.pets enable row level security;

-- Old "pets visible to owner or public" policy (when is_public existed)
-- is replaced with owner-only: a pet only ever resolves for its owner.
drop policy if exists "pets visible to owner or public" on public.pets;
drop policy if exists "pets visible to owner" on public.pets;
create policy "pets visible to owner"
  on public.pets for select
  using (user_id = auth.uid());

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
  -- 6-page floor: shorter than that doesn't read as a story; 800 cap
  -- protects against a malformed client request kicking off a runaway
  -- image job. Hardcover printing additionally requires >= 24 pages
  -- and is gated on the /ship route — that check is application-level
  -- so the same row can still be sold as a digital book.
  page_count int not null check (page_count between 6 and 800),
  pages jsonb not null,
  cover_image text,
  created_at timestamptz not null default now()
);

-- Existing deployed DBs may have the old `between 24 and 800` check;
-- drop the old constraint (named auto by Postgres as
-- `stories_page_count_check`) so they accept the new floor on re-run.
-- Safe to repeat: drop-if-exists handles the no-op case, the add-check
-- below puts the new constraint in place.
alter table public.stories drop constraint if exists stories_page_count_check;
alter table public.stories add constraint stories_page_count_check
  check (page_count between 6 and 800);

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
    check (kind in ('pet','generic')),
  -- Image-style preset id (see src/lib/image-styles.ts). Stored so
  -- regenerations and AI Assistant tweaks pick up the same look.
  add column if not exists image_style text not null default 'watercolor';

-- Digital purchase flag. When true, anyone with the story's link can
-- read all pages (paid digital tier). When false, non-owners see only
-- a watermarked 3-page preview. Owners always see the full story
-- regardless of this flag.
alter table public.stories
  add column if not exists digital_unlocked boolean not null default false;

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

-- Jobs are only ever written from server contexts (HTTP routes that
-- created the job + Inngest functions that mutate it). Explicit revoke
-- on writes keeps the table honest even if a future contributor swaps
-- in a user-scoped client.
revoke insert, update, delete on public.jobs from anon, authenticated;

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
  -- story_id starts NOT NULL at insert time; the FK is flipped to
  -- ON DELETE SET NULL below so that retained / anonymized order rows
  -- (e.g. shipped books that survive an account deletion for tax /
  -- Stripe reconciliation) keep their non-PII columns even after the
  -- underlying story is hard-deleted. On a brand-new DB the FK is
  -- created here as ON DELETE CASCADE; the idempotent ALTER beneath
  -- this CREATE flips it to SET NULL on every re-run.
  story_id uuid not null references public.stories(id) on delete cascade,
  -- Known status values (open value space — no CHECK constraint):
  --   pending     — row pre-created before Stripe Checkout completed
  --   paid        — payment succeeded; awaiting fulfillment build
  --   building    — fulfillment worker has claimed the row; building PDFs
  --   received    — PDFs ready; sitting in admin queue for manual ship
  --   in_progress — admin has placed the print order with the vendor
  --   shipped     — admin marked the order as shipped (anonymized on
  --                 account deletion; retained for tax / Stripe records)
  --   delivered   — admin marked the order as delivered
  --   failed      — PDF build or admin step failed; needs investigation
  --   refunded    — Stripe charge.refunded webhook; digital unlock revoked
  --   disputed    — Stripe charge.dispute.created webhook; fulfillment paused
  --   expired     — Stripe checkout.session.expired webhook (pre-payment)
  status text not null default 'pending',
  amount_usd numeric(10, 2),
  paypal_capture_id text,
  stripe_session_id text,
  interior_pdf_url text,
  cover_pdf_url text,
  created_at timestamptz not null default now()
);

-- Note: a `lulu_print_job_id text` column existed in earlier deploys
-- when fulfillment was auto-routed through Lulu Direct. Lulu has been
-- removed; admins now fulfill orders manually. The column is harmless
-- if it still exists in your DB (always null going forward); drop it
-- with `alter table public.print_orders drop column if exists lulu_print_job_id;`
-- when you're ready.

alter table public.print_orders
  add column if not exists stripe_session_id text,
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  -- Persisted shipping address JSON so the admin /orders queue can see
  -- where to ship without re-fetching from Stripe. Stored as a single
  -- JSON string (matches packAddressMetadata's shape).
  add column if not exists shipping_address text,
  -- Number of copies in this order. Capped client-side to a sane max
  -- (see MAX_QUANTITY in /api/ship/stripe/checkout). Default 1 keeps
  -- legacy rows valid.
  add column if not exists quantity int not null default 1;

-- Flip story_id FK to ON DELETE SET NULL and drop NOT NULL so that
-- retained / anonymized order rows survive a story delete. The /api/
-- account DELETE handler relies on this: it nulls out story_id on
-- shipped orders before deleting the user's stories so the historical
-- tax / Stripe records aren't cascade-wiped. Idempotent — safe to re-
-- run on fresh and existing deployments.
alter table public.print_orders
  drop constraint if exists print_orders_story_id_fkey;
alter table public.print_orders
  add constraint print_orders_story_id_fkey
  foreign key (story_id) references public.stories(id) on delete set null;
alter table public.print_orders alter column story_id drop not null;

create unique index if not exists print_orders_stripe_session_id_idx
  on public.print_orders (stripe_session_id) where stripe_session_id is not null;

-- Persisted Stripe payment_intent id. Captured during fulfillment
-- (the PI is only assigned once Checkout completes) so refund and
-- dispute webhooks can look up the order directly instead of going
-- through `stripe.checkout.sessions.list({ payment_intent })`, which
-- returns [] for older sessions and async-completed PIs. The session-
-- list fallback is still wired in the webhook for orders that pre-
-- date this column.
alter table public.print_orders
  add column if not exists payment_intent_id text;
create index if not exists print_orders_payment_intent_id_idx
  on public.print_orders (payment_intent_id);

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

-- Explicit deny on writes via PostgREST. RLS without an INSERT/UPDATE/
-- DELETE policy already blocks anon + authenticated writers, but the
-- explicit revoke makes the intent obvious and survives any future
-- "permissive by default" misconfiguration. All writes flow through
-- service-role only.
revoke insert, update, delete on public.print_orders from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Print-order audit log
--
-- Append-only history of status transitions on a print order. Every time
-- the admin moves an order through the fulfillment funnel (received →
-- in_progress → shipped → delivered, or → failed), we write a row here
-- with who did it and when. Useful for debugging "did I already mark
-- this shipped?" and any future support questions.
--
-- Inserts happen via service-role from the admin status-update route, so
-- we don't grant insert/update/delete to anyone. Anon and authenticated
-- users can read events for their own order so the customer success
-- page can show a basic timeline.
-- ---------------------------------------------------------------------------

create table if not exists public.print_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.print_orders(id) on delete cascade,
  status text not null,
  note text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists print_order_events_order_id_idx
  on public.print_order_events (order_id, created_at desc);

alter table public.print_order_events enable row level security;

drop policy if exists "events readable for the order's owner"
  on public.print_order_events;
create policy "events readable for the order's owner"
  on public.print_order_events for select
  using (
    exists (
      select 1 from public.print_orders po
      where po.id = print_order_events.order_id
        and po.user_id = auth.uid()
    )
  );

revoke insert, update, delete on public.print_order_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Support chat
--
-- One ongoing thread per user (UNIQUE on user_id). Users read/write
-- their own thread via RLS; the admin uses the service-role client
-- and bypasses RLS to read every thread and reply.
--
-- Read-receipt timestamps power the "blue dot" indicators on both
-- sides: the user sees a dot when the admin replied after their
-- last read; the admin sees a dot when the user messaged after the
-- admin's last read.
-- ---------------------------------------------------------------------------

create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  user_last_read_at timestamptz not null default now(),
  admin_last_read_at timestamptz not null default now()
);

create index if not exists support_threads_user_id_idx
  on public.support_threads (user_id);
create index if not exists support_threads_last_message_idx
  on public.support_threads (last_message_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  sender text not null check (sender in ('user','admin')),
  body text not null check (length(body) > 0 and length(body) <= 4000),
  created_at timestamptz not null default now()
);

create index if not exists support_messages_thread_idx
  on public.support_messages (thread_id, created_at);

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists "users read own support thread" on public.support_threads;
create policy "users read own support thread"
  on public.support_threads for select
  using (user_id = auth.uid());

drop policy if exists "users insert own support thread" on public.support_threads;
create policy "users insert own support thread"
  on public.support_threads for insert
  with check (user_id = auth.uid());

drop policy if exists "users update own support thread" on public.support_threads;
create policy "users update own support thread"
  on public.support_threads for update
  using (user_id = auth.uid());

drop policy if exists "users read own support messages" on public.support_messages;
create policy "users read own support messages"
  on public.support_messages for select
  using (
    exists (
      select 1 from public.support_threads t
      where t.id = support_messages.thread_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists "users insert own support messages" on public.support_messages;
create policy "users insert own support messages"
  on public.support_messages for insert
  with check (
    sender = 'user'
    and exists (
      select 1 from public.support_threads t
      where t.id = support_messages.thread_id
        and t.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Rate limiting (Postgres-backed, fixed-window counter).
--
-- Used by /api/generate, the AI Assistant routes, and /api/upload to cap
-- per-user request volume. Keyed by an opaque string like
-- "generate:<userId>"; the check_rate_limit function atomically
-- increments and returns whether the caller is still within budget.
-- Service-role only (never exposed to anon/authenticated).
-- ---------------------------------------------------------------------------

create table if not exists public.rate_limits (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now()
);

create index if not exists rate_limits_window_idx
  on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  insert into public.rate_limits (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update set
    count = case
      when extract(epoch from (now() - public.rate_limits.window_start)) > p_window_seconds
        then 1
      else public.rate_limits.count + 1
    end,
    window_start = case
      when extract(epoch from (now() - public.rate_limits.window_start)) > p_window_seconds
        then now()
      else public.rate_limits.window_start
    end
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.check_rate_limit(text, int, int) from public, anon, authenticated;

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

revoke all on function public.update_story_page_fields(uuid, int, jsonb) from public;
revoke all on function public.update_story_page_fields(uuid, int, jsonb) from anon;
-- Also revoke from authenticated so the RPC is unreachable via PostgREST
-- (Supabase grants execute to authenticated by default on every function
-- in `public`). The only legitimate caller is the service-role client.
revoke all on function public.update_story_page_fields(uuid, int, jsonb) from authenticated;
