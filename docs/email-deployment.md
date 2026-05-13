# Email deployment (Resend)

StoryInk sends transactional email (order confirmations, shipping updates,
support replies) via [Resend](https://resend.com). Resend will refuse to
send mail from any domain you have not verified — by design — so the
first time you boot the app in a real environment, you have to do the
DNS work below before the `From:` line on outgoing mail will be
accepted.

This is a one-time setup per sending domain. After that, switching
inbox prefixes (`orders@`, `support@`, `noreply@`) on the same verified
domain just means changing `EMAIL_FROM` in env.

## 1. Create a Resend account and API key

1. Sign up at [resend.com](https://resend.com).
2. In the dashboard go to **API Keys → Create API Key**.
3. Give the key a name (e.g. `storyink-production`) and the `Send` scope.
4. Copy the key value (it starts with `re_`). You will not be able to
   read it again after closing the dialog.
5. Set `RESEND_API_KEY` in your production environment.

For local development, you can either:

- Leave `RESEND_API_KEY` unset — `sendEmail()` in
  `src/lib/email.ts` detects the missing key and logs a no-op message
  instead of throwing, so the app keeps working without delivering
  mail.
- Or create a separate `storyink-dev` key and set it locally; mail
  will go out for real, so be mindful of who you `to:`.

## 2. Add and verify your sending domain

1. In the Resend dashboard, **Domains → Add Domain**.
2. Enter the domain you intend to send from (e.g. `storyink.ai`). Use
   the apex domain, not a subdomain, unless you want sender addresses
   under a subdomain.
3. Resend will display the DNS records you need to add — typically:
   - One **SPF** TXT record (or addition to your existing SPF record)
   - Two **DKIM** CNAME records pointing to Resend's signing infra
   - One **DMARC** TXT record (Resend may or may not provide a default
     value; see step 3 below for the policy we recommend)
4. Copy the records **exactly as Resend shows them** — even the order
   of values matters for some registrars.

## 3. Add the records to your DNS registrar

1. Open your domain registrar (Cloudflare, Namecheap, Google Domains,
   Route 53 — whoever is authoritative for the domain).
2. Add each record from the Resend dashboard.
3. For DMARC, if Resend gives you a default record, use it. Otherwise
   we recommend starting with:

   ```
   Name:  _dmarc.storyink.ai
   Type:  TXT
   Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@storyink.ai
   ```

   Why `p=quarantine` rather than `p=reject` for a new domain:

   - `p=none` tells receivers to take no action on failures. It is
     fine for monitoring-only mode but offers no spoofing protection.
   - `p=quarantine` tells receivers to send failing mail to the spam
     folder. This is the right starting policy for a brand-new sending
     domain because it gives spoof attempts a soft landing while you
     watch the `rua` reports for legitimate mail that is accidentally
     misconfigured.
   - `p=reject` tells receivers to drop failing mail outright. Move to
     this once you have seen 2–4 weeks of clean DMARC reports
     (no legitimate mail being marked as failing) at `p=quarantine`.
     Going straight to `p=reject` on day one will silently drop your
     own transactional mail if any of your SPF/DKIM records have a
     subtle problem.
4. The `rua=mailto:dmarc@...` mailbox is where receivers send daily
   aggregate reports. You can use any working mailbox; a shared inbox
   on the operations team is fine.

## 4. Wait for DNS propagation

DNS changes can take anywhere from a few minutes to 24 hours to
propagate, depending on registrar TTLs. The Resend dashboard polls and
shows a green "Verified" status on each record once it sees the
correct value.

Do not move on to step 5 until every record is showing as verified.
Trying to send before verification completes will fail with an
`unverified domain` error.

## 5. Set `EMAIL_FROM` in production

Once the domain shows verified in Resend, set the environment variable
in your production deploy:

```
EMAIL_FROM="StoryInk <orders@storyink.ai>"
```

Format: a display name in quotes followed by the address in angle
brackets. The mailbox prefix (`orders@`) can be anything you like —
Resend accepts any prefix at a verified domain. We use:

- `orders@` — for transactional order email
- `support@` — for replies from support staff
- `noreply@` — for system notifications that should not get replies

You only need one address to start. Add more by changing the `from:`
field on a `sendEmail()` call site as needed; no new DNS work is
required when the inbox prefix changes.

If you forget to set `EMAIL_FROM`, `src/lib/email.ts` falls back to a
deliberately invalid placeholder (`noreply@example.invalid`) so
Resend will reject the first send and the error will surface
immediately — preferable to silently sending from a real-looking but
unowned address.

## 6. Smoke test in production

The simplest end-to-end check:

1. Sign in as an admin account in production.
2. Place a real-but-discounted hardcover order (you can wire a $0
   admin bypass for this if you have not already; otherwise place a
   small real one and refund it).
3. Confirm the order confirmation email lands in your inbox **and not
   the spam folder**. If it lands in spam, your DKIM or DMARC
   alignment is probably off — check the Resend dashboard's send log
   for the DKIM signing status on that send.
4. Open the email and click any links in it. Make sure they go to
   production, not localhost.

Repeat with a gmail address, an outlook address, and an icloud
address if you want broader confidence — each receiver does mild
reputation scoring of its own.

## 7. Follow-up: bounce + complaint monitoring

Resend can webhook your app on `email.bounced`, `email.complained`,
and `email.delivery_delayed` events. Subscribing to those lets you:

- Suppress addresses that have hard-bounced (sending to them again
  damages your sender reputation).
- Notice complaint spikes early (someone marking your mail as spam
  pulls the whole domain's reputation down).

This is **not in this commit** — flagged as a follow-up:

- Add `src/app/api/email/webhook/route.ts` to receive the webhook,
  verify the signing secret, and write bounce/complaint state into a
  new table (or a column on the user / order row).
- Set the webhook URL in the Resend dashboard under **Webhooks**.
- Set the corresponding signing secret in `RESEND_WEBHOOK_SECRET`.

Until that lands, check the Resend dashboard manually once a week —
any volume of bounces or complaints there is worth investigating.

## Troubleshooting

- **`unverified domain` errors** — re-check that every DNS record in
  the Resend dashboard is green. Even one red SPF/DKIM record blocks
  sending from the domain.
- **Mail lands in spam consistently** — check DKIM signing on a
  specific send in the Resend dashboard. Also make sure the SPF record
  resolves to a single, clean `v=spf1 ... -all` line; multiple SPF
  records on the same domain silently break SPF alignment.
- **No mail being sent locally** — expected if `RESEND_API_KEY` is
  unset. Look for `[email] RESEND_API_KEY unset — skipping send`
  lines in the dev log.
- **Mail being sent locally that should not be** — unset
  `RESEND_API_KEY` locally, or set it to a dev-only key.
