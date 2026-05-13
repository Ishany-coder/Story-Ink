# Disaster recovery runbook

What to back up, how to restore, how to drill it, and how to respond to
the failure modes we expect. Keep this doc close to the on-call rotation
documentation; review it once per quarter when you run the restore drill.

## Sources of truth, by system

| System  | Holds                                                                 | We back up?                          | Notes                                                                                                          |
| ------- | --------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Supabase Postgres | Users, pets, stories, jobs, custom layouts, print orders   | Yes — automated daily backups        | Free tier: 7-day rolling window. Pro tier: 30-day window + PITR. **Upgrade to Pro before paid launch.**         |
| Supabase Storage  | Pet reference photos, generated illustrations, print PDFs  | Partially — see "Storage backup"     | Storage objects are included in Supabase project backups, but objects can be uploaded faster than backups capture. Enable Storage versioning per-bucket. |
| Stripe            | Payments, customers, receipts                              | No — Stripe is the system of record  | Stripe holds 7+ years of charge history. We rely on Stripe for any payment-related restore.                    |
| Resend            | In-flight transactional email                              | No — transient                       | We never need to recover email. Mailbox at the recipient is the durable copy.                                  |
| Sentry            | Error events                                               | No                                   | Events expire on Sentry's retention schedule. They are diagnostic only, not user data.                         |
| Gemini API        | Nothing                                                    | N/A — stateless                      | We send prompts and get back text/images. There is no Gemini-side state to restore.                            |
| Inngest           | Job runs and step history                                  | No                                   | Inngest retains run history for ~30 days. Older runs are lost; this is acceptable.                             |

The implication: if Supabase loses our project, the user-visible data
that matters is gone unless we have a recent backup. Everything else is
either a transient (email, error events) or owned by a different vendor
(Stripe). The runbook below is mostly a runbook for protecting and
restoring Supabase.

## Supabase backup strategy

### Free tier (current)

- Daily automated backups, retained for 7 days.
- No point-in-time recovery (PITR) — restores land you at the
  midnight-ish snapshot for one of the last seven days.

### Pro tier (recommended before paid launch)

- Daily automated backups, retained for 30 days.
- Point-in-time recovery (PITR) for the last 7 days at granularities
  down to ~2 minutes.
- Higher per-request budgets that matter once you have paying users.

Cost is a few tens of dollars per month. **Upgrade before you start
taking real payments.** A 7-day backup window is tight if the loss is
discovered late.

### Enabling Storage versioning

Storage object versioning is configured per bucket. To enable on the
`uploads` bucket:

1. Supabase dashboard → **Storage → uploads → Configuration**.
2. Enable **Versioning**.
3. New writes will retain previous versions of the same key until the
   bucket's lifecycle policy expires them. Set a retention that matches
   your DB backup retention (30 days on Pro tier).

Versioning protects against the case where a user (or buggy code) writes
a corrupt image over a good one, and the corruption is not noticed
until after the next nightly backup has captured the bad state.

## Restore procedure

For a Postgres restore from a Supabase backup:

1. Supabase dashboard → **Database → Backups**.
2. Pick the backup timestamp closest to (and just before) the loss
   event. On Pro tier with PITR you can pick a specific minute.
3. Click **Restore**. Supabase creates a **new project** (a "branch")
   with the restored data, rather than overwriting your live project.
4. Verify the restored project by signing in to it directly and
   spot-checking recent data.
5. Swap the production env vars to point at the restored project:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
6. Redeploy. The app comes back pointed at the restored data.
7. Once you are confident the restored project is healthy, archive the
   broken original (do not delete it for at least 30 days — it might
   still have artifacts you need).

Notes:

- The Supabase project ID changes on restore — that ID appears in
  Storage object URLs. Existing rows in the restored DB still reference
  the **old** project's URLs in any column where we cached an absolute
  URL. Most of our reads go through helper functions that resolve from
  the project at request time, but audit `pets.photo_url`,
  `stories.cover_image`, and `stories.pages` for embedded absolute
  URLs before declaring the restore complete. Migration script lives at
  `scripts/rewrite-storage-urls.ts` if you have not built one yet —
  flag this as a TODO when you first do a real restore.
- A restore does not move Stripe state. Order rows restored from the
  backup may be out of sync with the current state of the matching
  Stripe Checkout session. Reconcile by walking the `print_orders`
  rows with `status in ('paid','building','received','in_progress')`
  against Stripe via the Stripe dashboard or a one-off script.

## Quarterly restore drill

Run this every 90 days. Add it as a recurring calendar event on the on-
call rotation:

1. Trigger a restore of the most recent Supabase backup to a **scratch
   project** (do not touch production).
2. Point a local dev environment at the scratch project (swap the env
   vars in `.env.local`).
3. Run the smoke test below.
4. Document any friction in this file and fix the gap before the next
   drill.
5. Delete the scratch project when you are done.

### 5-minute smoke test (used after restore + during drill)

- Sign in with a real test account.
- Open the home page; verify your previous pets and stories appear.
- Open one existing story in **Read**; verify the pages render with
  illustrations.
- Create a **new pet** with a single photo.
- Generate a **6-page story** for that pet in Living mode.
- Open the resulting story in the **Studio**; verify edit controls
  work.
- Open `My orders`; verify any previous orders are listed.
- (Optional) Place a test hardcover order with an admin-bypass coupon
  or a $0 mode and confirm the order email arrives.

If all of that works on the restored project, the restore is good.

## What is NOT backed up — and why

- **Stripe payments and customers** — Stripe is the durable source.
  Replicating it on our side would be expensive and would also create
  a parallel system of record we would have to keep aligned. Bad idea.
- **Resend transactional email** — by the time you would need to
  recover it, the recipient already has it (or does not). Re-trigger
  from the same endpoint that sent it the first time if you must.
- **Sentry events** — diagnostic data, not customer data. Expiring on
  Sentry's retention is fine.
- **Inngest run history beyond ~30 days** — Inngest drops old runs.
  This is acceptable because our jobs are not the system of record for
  anything (the DB row is). The run history is useful for debugging
  recent failures, not for permanent audit.
- **Anything in process memory** — fan-out across multiple servers
  already means we never assume anything is "in memory" durably.

## Disaster scenarios + response

### Supabase region outage

- **Symptom**: requests to the dashboard or to our app's DB calls hang
  or return 500. The Supabase status page (`status.supabase.com`)
  shows a regional incident.
- **Expected duration**: typically 5-30 minutes for a regional blip;
  rarely longer.
- **User-visible**: the app's error boundary catches DB errors and
  shows an "Something went wrong, please retry" page. New story
  generation will queue but Inngest functions will fail when they try
  to write back.
- **Response**:
  1. Confirm against `status.supabase.com` that it is regional, not
     us.
  2. Post a one-line incident notice in our own status channel (or on
     Twitter if you have a public channel).
  3. Do **not** try to fail over to a backup project mid-incident
     unless the outage is forecast to last more than 4 hours. The
     swap-and-redeploy procedure is risky enough that doing it under
     pressure usually makes things worse.
  4. After recovery, scan Inngest for any function runs that failed
     during the window. Retry the ones that look like they were
     genuinely interrupted by the outage rather than by a logic bug.

### Stripe webhook delivery is broken

- **Symptom**: orders show `status='paid'` for longer than expected.
  `print_orders` are not progressing to `building`.
- **Cause**: Stripe webhook signature mismatch (wrong
  `STRIPE_WEBHOOK_SECRET`), webhook endpoint returning 5xx, or Stripe
  webhook delivery itself is degraded.
- **Response**:
  1. Check Stripe dashboard → **Developers → Webhooks**. Look at the
     recent deliveries for our endpoint. 4xx errors mean we are
     rejecting them; 5xx means the endpoint is broken; missing means
     Stripe is not even trying.
  2. The `confirm` route on the success page is a safety net — it
     calls the same `fulfillFromSession` path opportunistically. So a
     subset of orders may still complete even with the webhook down.
  3. The nightly stuck-rows cron expires `paid`/`pending` rows that
     have been stuck for an unreasonable time. This is the worst-case
     backstop, not a fix.
  4. To force-fulfill while the webhook is broken, sign in as admin
     and use the admin queue's manual-fulfill action against the
     affected order ids.

### Gemini quota exhausted (daily cap hit)

- **Symptom**: story generations return errors. Inngest functions
  retry, then fail. Users see "Generation failed — please try again"
  pages.
- **Cause**: we hit the daily Gemini API cap, or our paid quota
  expired, or the model we use was deprecated.
- **Response**:
  1. Confirm by checking the Gemini API quota dashboard.
  2. If it is a daily cap, the cap resets at midnight Pacific.
  3. Surface a clear in-app banner on `/create` so new users do not
     keep submitting jobs they know will fail. The system already
     returns a 503 on the generate route in this state.
  4. If the cap is hit because of legitimate growth, request a higher
     quota from Google.
  5. If the cap is hit because of abuse (somebody is submitting
     thousands of jobs from one account), tighten rate limits before
     unblocking.

### Storage breach / leaked service-role key

- **Symptom**: signs that someone has gained access to the Supabase
  service-role key — unexpected writes to tables, unexpected Storage
  uploads or deletes, anomalous traffic patterns in logs.
- **Response**:
  1. **Immediately**: rotate `SUPABASE_SERVICE_ROLE_KEY` in the
     Supabase dashboard. Redeploy with the new key. The old key
     becomes invalid as soon as the rotation completes.
  2. Rotate `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` if the
     attacker could have accessed them — assume yes if they reached
     the env.
  3. Rotate `GEMINI_API_KEY`, `RESEND_API_KEY`, and `INNGEST_SIGNING_KEY`
     for the same reason.
  4. Audit RLS policies on every table for permissive policies that
     could have been exploited. Tighten or fix as needed.
  5. Review recent inserts, updates, deletes on `pets`, `stories`,
     `print_orders`, `support_threads` for anomalies during the
     suspected exposure window.
  6. Determine whether user data was accessed. If yes, prepare a
     notification to affected users per the data-protection laws
     applicable to where they live.
  7. Post a clear all-clear to users once you are confident the
     breach is closed.

### Lost domain or DNS hijack

- **Symptom**: the domain points somewhere we did not put it, or the
  registrar account has been transferred away from us.
- **Response**:
  1. Contact the registrar (Namecheap, Cloudflare, etc.) support line.
     They have transfer-recovery procedures for hijacked domains.
  2. Inform users via any out-of-band channel you still control
     (Twitter, email if you have a backup MX, the team Slack).
  3. While the domain is contested, do NOT try to recreate the service
     on a different domain — that fragments the user base.
  4. After recovery, enable registrar lock and 2FA on the registrar
     account. If they were already enabled, the loss happened
     somewhere social-engineered; treat the registrar account itself
     as compromised and rotate registrar passwords.

The contact info for the registrar (account login, support phone
number, fallback email) should live in the same secure-credentials
store you keep the rest of the production secrets in — wherever that
is for your team. Do not put it in a checked-in file.

## Health probe

`GET /api/health` returns a small JSON status object with the connection
state of each required dependency. Wire your uptime monitor (UptimeRobot,
BetterStack, Pingdom, etc.) at this endpoint and alert on any 503 or any
30s+ window without a 200.

The endpoint is intentionally cheap: it only checks that required env
vars are present. It does **not** ping the database or Stripe. That is
on purpose — a probe that puts constant load on Supabase per request is
worse than no probe, and a failing probe should mean "the app is
misconfigured," not "the database is slow." Use Supabase's own status
page for direct-DB health.
