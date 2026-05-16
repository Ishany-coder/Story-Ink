# Supabase Auth email templates

Branded HTML for the four auth emails Supabase sends directly (we don't send these from `sendEmail()` — Supabase Auth does). Paste each file into the matching template slot in **Supabase Dashboard → Authentication → Email Templates**, save, and verify with a real signup.

These assume Custom SMTP is already wired to Resend per `docs/email-deployment.md` § 7. If you skip the SMTP step, the templates will still render but the `From:` line will say `*@supabase.co`, defeating the purpose.

## Files

| File | Supabase slot | Template variable(s) used |
|---|---|---|
| `confirm-signup.html` | **Confirm signup** | `{{ .ConfirmationURL }}` |
| `magic-link.html` | **Magic Link** | `{{ .ConfirmationURL }}` |
| `change-email.html` | **Change Email Address** | `{{ .ConfirmationURL }}`, `{{ .NewEmail }}` |
| `reset-password.html` | **Reset Password** | `{{ .ConfirmationURL }}` |

The literal `{{ .Variable }}` tokens are Supabase's Go-template syntax — leave them exactly as-is, Supabase replaces them at send time.

## Design notes

- 600px-wide content card on cream paper background (`#f5f1e8`), white card with cream-300 border. Mobile collapses to full-width via the `@media` rule.
- Wordmark uses Georgia/serif because custom web fonts (`var(--font-display)`) don't load in 90% of email clients. Georgia is the closest fallback that ships on every desktop and mobile OS.
- CTA is bulletproof for Outlook desktop via VML `<v:roundrect>` (rounded pill) with a CSS `<a>` fallback for everyone else. Don't strip the `<!--[if mso]>` blocks or Outlook will render a square button instead of a pill.
- Subject lines are not set in the HTML — they live in the Supabase template editor's **Subject** field. Suggested subjects:
  - **Confirm signup:** `Confirm your StoryInk email`
  - **Magic Link:** `Your StoryInk sign-in link`
  - **Change Email Address:** `Confirm your new email`
  - **Reset Password:** `Reset your StoryInk password`
- Preheader (preview text the inbox shows next to the subject) is in a hidden `<div>` at the top of each `<body>`. Edit those if you change the copy.

## Updating

1. Edit the file here, commit, and push (so the repo is the source of truth).
2. Paste the new contents into the Supabase template editor.
3. Send a test email from the editor (gear icon → "Send a test email") to confirm.

Supabase does not poll this folder — pasting is a manual sync step.

## Testing checklist

For each template, send a test to:

- [ ] Gmail (web) — confirms CSS support is fine, link tracking shows up correctly.
- [ ] Gmail (iOS) — confirms the mobile breakpoint kicks in (card becomes full-width).
- [ ] Outlook (desktop / Microsoft 365) — confirms the VML pill button renders rounded, not square.
- [ ] Apple Mail (macOS or iOS) — confirms the cream background isn't clobbered by dark mode (we declared `color-scheme: light only` to opt out, but verify anyway).

If a client renders the layout poorly, the file is the source — edit it, re-paste, retest. Don't drift from the dashboard.
