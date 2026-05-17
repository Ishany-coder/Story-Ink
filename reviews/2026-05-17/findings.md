# StoryInk audit — 2026-05-17

Running log of findings from a structured walk-through of the local app
(`localhost:3000`) using Chrome DevTools MCP. Captured screenshots live in
`screenshots/`, a11y snapshots in `snapshots/`. Severity legend at bottom.

Status: **in progress** — Phase 1 discovery walk.

---

## Critical

### C1. Landing page loads 49 Google Font families (twice) on every route
**Page:** every page — root layout injects the stylesheet
**Source:** `src/app/layout.tsx:86` injects `<link rel="stylesheet" href={GOOGLE_FONTS_HREF} />` from `src/lib/fonts.ts:132`
**Symptom:** A 1.4 KB stylesheet request fires twice (`reqid=30` + `reqid=31` on landing) listing 49 font families. The CSS itself is small but it is render-blocking, opens a connection to `fonts.gstatic.com` on every navigation, and on the first paint of any page the browser doesn't yet know which families it will actually need.
**Why it's wrong:** these 49 fonts only exist for the Studio's text-layer font picker (`CanvasEditor.tsx`) and for rendered overlays in `/canvas/[id]` + `/read/[id]`. The marketing site, signup, dashboard, account, blog, etc. never use them. The file-level comment in `src/lib/fonts.ts:14-16` actually justifies this with "the cost of loading 50 families on every page is negligible" — but it's not: this is the single biggest render-blocking request on the marketing site, and the duplicate fires for a reason we should investigate.
**Recommended fix:**
1. Remove the `<link rel="stylesheet" href={GOOGLE_FONTS_HREF} />` from `src/app/layout.tsx`.
2. Add it back inside the route group that contains `/canvas` and `/read` only — either a shared layout under `src/app/(book)/layout.tsx` or as a component the Studio/Reader render in their head. Even better: lazy-inject when a TextLayer is first rendered.
3. Investigate why the link tag appears twice in the DOM (`document.querySelectorAll('link[rel="stylesheet"]')` returns 3 stylesheets, 2 of them being identical Google Fonts URLs). Likely React's strict mode dev-only double render, but verify in `npm run build && npm run start`.

**Effort:** S (≤ 30 min once verified).

---

## High

### H1. Submit button on `/login` is missing the focus-visible ring
**Page:** `/login`
**Source:** `src/app/login/page.tsx:502-524`
**Symptom:** the form-submit button class string is
`w-full rounded-full bg-moss-700 px-6 py-2.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 disabled:cursor-not-allowed disabled:opacity-50`
The CLAUDE.md primary-button spec explicitly requires `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2` and says "Do not drop the focus ring without replacing it." Keyboard users have no visible focus on the most important button on the login page.
**Recommended fix:** add the three focus-visible classes from the CLAUDE.md primary-button shape. Also align `px-6` → `px-5` to match the canonical size.

### H2. Google sign-in button uses `bg-white` (off-palette) + missing focus ring
**Page:** `/login`
**Source:** `src/app/login/page.tsx:414`
**Symptom:** classes include `bg-white` and no `focus-visible:ring-*`. `bg-white` is on the CLAUDE.md off-palette deny-list (map: white → `bg-cream-50`).
**Recommended fix:** swap `bg-white` → `bg-cream-50`, reshape to the secondary-button spec (`border-cream-300`, focus ring, etc.).

---

## Medium

### M1. Authenticated navbar overflows at desktop widths — buttons wrap mid-word
**Page:** every authenticated page (Home, Characters, Read, Studio, Ship, My orders, …)
**Source:** `src/components/Navbar.tsx:49-69` + `src/components/NavTabs.tsx:116-134`
**Symptom:** at 1440×900 the "+ New story" pill renders the label on two lines ("New / story") and the email-plus-Sign-out pill renders "Sign / out" on two lines. The user's email (`audit-2026-05-17@storyink.test`) consumes ~270px of the right side and squeezes everything to its left. Visible in every signed-in screenshot (10-16).
**Why it happens:** the button labels in `Navbar.tsx:55` (`New story`) and `Navbar.tsx:67` (`Sign out`) lack `whitespace-nowrap`. When the right-cluster overflows, those labels wrap into two-line buttons. The 7 NavTabs entries (Home / Characters / Read / Blog / Studio / Ship / My orders) also compete for the same row.
**Recommended fix (two layers):**
1. Add `whitespace-nowrap` to the "New story" button (`Navbar.tsx:52`) and "Sign out" button (`Navbar.tsx:58`) so labels never wrap.
2. Replace the always-visible email pill with either a truncated email (max ~16 chars with ellipsis) or a user-avatar button that opens a dropdown containing email + Sign out. This eliminates ~270px of constant nav width and makes the layout robust to long emails.
**Effort:** S (≤ 30 min).

### M2. Signup surface returns "Error sending confirmation email" with no recovery
**Page:** `/login` (signup mode)
**Source:** `src/app/login/page.tsx:256-264` (caller) — the error string comes from Supabase
**Symptom:** with Supabase's "Confirm email" turned ON but no working SMTP (the local `.env.local` has no `RESEND_API_KEY` / `EMAIL_FROM`), every signup attempt surfaces a single rose-toned line "Error sending confirmation email" under the submit button with no:
- explanation of what went wrong
- retry button
- suggestion to try Google sign-in instead
- contact link
**Why this matters in production:** if `RESEND_API_KEY` is ever rotated, mistyped, or the Resend domain is briefly de-verified, every new signup will hit this exact wall. The error tracks server-side (Supabase) but the user sees nothing actionable.
**Recommended fix:** branch on `err.message` matching `/confirmation email/i` and render a friendlier block with: a "Try Google sign-in" CTA, a contact link to `help@storyink.ai`, and a one-line explanation ("We couldn't send your confirmation email. This is usually a temporary issue — please try again in a minute, sign in with Google, or contact us."). Send a Sentry event so on-call sees the SMTP failure.
**Effort:** S (≤ 45 min including the Sentry capture).

### M3. `/help` is two cards then ~50vh of dead space
**Page:** `/help`
**Symptom:** the entire help center is two cards: "Email us anytime" (mailto link) + "Prefer live chat? — Sign in to chat". Below the cards is ~50% of viewport-height of empty cream before the footer. There are no inline FAQ articles, no troubleshooting guides, no setup walkthroughs — even though the landing page FAQ has good content that could be re-used here.
**Why it looks unprofessional:** users who click "Help" in the nav expect at minimum an FAQ section. Two contact cards with a wide empty void below reads as "we haven't built this yet."
**Recommended fix:**
1. Pull the 6 FAQ entries from `LandingPage.tsx` into a shared component and render them on `/help` too.
2. Add a links section to the three blog posts surfaced in the footer ("Pet memorial book guide", "Writing prompts", "Reference photo guide").
3. Add a "What can the AI do?" section that links to the Studio docs / a short demo.
**Effort:** M (1-2h to extract the FAQ component cleanly and reuse).

### M4. `/account` is GDPR-only — no email/password/billing controls
**Page:** `/account`
**Symptom:** the entire account page is one card titled "Your data" with two buttons: "Export my data" and "Delete my account". There is no:
- email-address change
- password change
- view of past orders (separate page exists but not linked from here)
- view of generated stories (separate page)
- billing / payment-method management
- notification preferences
**Why it matters:** users hitting `/account` in a real app expect to be able to manage their account, not just delete it. The destructive action being the only thing on the page invites accidents.
**Recommended fix:** turn `/account` into a small landing with 3 cards: Profile (email/password change), Library shortcuts (link to /stories, /characters, /my-orders), Your data (the existing GDPR card). Even just adding the cross-links improves discoverability.
**Effort:** M (2-3h depending on whether Supabase Auth UI is reused for password change).

### M5. Cookie banner blocks footer interactivity until dismissed
**Page:** every page (banner spans full viewport bottom)
**Symptom:** the cookie consent banner is a sticky bottom bar that covers the footer links (Privacy, Terms, Help, Cookie settings) until the user clicks Reject or Accept. On the `/help`, `/privacy`, `/terms`, `/blog/...` pages where the user is specifically trying to read the page that's being referenced ("See our Privacy Policy"), the banner sits on top of the actual content they may want to interact with.
**Why it matters:** GDPR best practice is to keep cookie banners visible but unobtrusive. A fixed bottom banner that overlaps the footer ribbon is fine; one that visibly overlaps page text on short pages (like /help and /my-orders) is jarring.
**Recommended fix:** check the banner's z-index and consider making it occupy a reserved padding-bottom on `body` so it never overlaps content, OR auto-dismiss after the user actually scrolls past 80% of the page (implies they've engaged).
**Effort:** S (≤ 30 min).

---

## Low

### L1. Beta banner / dev banner styling check
Visible at the top of every page below the navbar — appears as the thin pale strip in the screenshots. Verify it has dismiss + remember-dismissed behavior, doesn't push content awkwardly on first-page-load.

### L2. The "audit-2026-05-17@storyink.test" pill in the nav has no avatar
Cosmetic — moving to an avatar circle (initial + color) is a standard signed-in pattern that also solves M1's length problem.

### L3. Help icon next to "Help" label in nav is just a comment-bubble emoji-ish glyph
`SupportChatLauncher` likely renders the speech-bubble icon. Confirm it's an SVG, not an emoji, for consistent rendering across OSes.

---

## Wizard-specific findings

### H3. Wizard recipient + style + cast cards have duplicated accessible names
**Page:** `/create/new` steps 1, 3, 5, 7
**Symptom:** the a11y snapshot shows every selectable card with its label twice in the accessible name:
- Step 1: `button "My Child My Child"`, `button "My Pet My Pet"`, ...
- Step 5: `button "Whimsy Watercolor Whimsy Watercolor"`, `button "Studio Ghibli Studio Ghibli"`, ...
- Step 7 review: `button "CAST Edit → Buddy Buddy"`
**Why it happens:** the card has both an `alt` on the inner illustration `<img>` and a visible label, or the wrapping button uses `aria-label` AND contains a visible text node with the same label. Either way, screen readers will announce the name twice ("My Pet, My Pet, button").
**Recommended fix:** the inner image should use `alt=""` (decorative) since the visible label already carries the meaning. Or, drop the `aria-label` from the button and let the visible text be the accessible name.
**Effort:** XS — likely a one-line fix in the card component.

### M6. Wizard Step 3 ("Build Your Cast") yanks you OUT of the wizard to a separate /characters/new page
**Page:** `/create/new` step 3 → `/characters/new?next=/create/new...`
**Symptom:** the wizard says "Add at least one character" but the only action available navigates to a fully separate full-page form (`/characters/new`). When you save, you bounce back to the wizard with `?addedCharacter=<id>`. The user is jarringly thrown out of the 7-step flow they were in.
**Why it's wrong:** every other wizard step renders its content inline (recipient cards, occasion chips, outline textarea, art-style cards, length slider, review card). Step 3 is the exception. The breadcrumbs / progress bar of the wizard disappear, the page chrome changes, and the user can't tell visually that they're still inside the same flow.
**Recommended fix:** either:
1. **(Recommended)** Render the character form inline as step 3 content. Mount it inside `StepShell`. The existing CharacterForm component can probably be reused as-is.
2. Open the character form as a modal overlaid on the wizard, never leaving step 3.
3. At minimum: when on `/characters/new?next=/create/new...`, render the wizard chrome (progress bar, Back/Next) around the form so the user still sees "STEP 3 of 7" while creating a character.
**Effort:** M (1-3h depending on which option).

### M7. Wizard Title-Case / sentence-case inconsistency
**Page:** `/create/new`
**Symptom:** step headings flip between:
- Sentence case: "Who is this book for?", "What's the occasion?", "Your story outline", "Pick your art style", "How long should it be?", "Ready to generate?"
- Title Case: "Build Your Cast" (step 3)

Same step also has a button label inconsistency: "Next" on steps 1-5 vs. "Continue" on step 6 vs. "Generate book" on step 7. (Continue / Generate book are intentional terminal labels — that's fine. But mixing "Next" vs. "Continue" mid-flow is not.)
**Recommended fix:** standardize on sentence case throughout ("Build your cast"). Standardize the advance button to "Next" except for the final-screen "Generate book" CTA.
**Effort:** XS — string edits in WizardClient.

### M8. Step 4 textarea is a controlled input that needs `onChange`, but doesn't accept programmatic `value` setters
**Page:** `/create/new` step 4
**Symptom:** while testing with chrome-devtools `fill_form`, the textarea visually updates but the Next button stays disabled — the React state didn't update because `fill_form` sets `.value` directly without firing the right input events. Native users will not see this bug, but it suggests the textarea is using a tightly-coupled controlled-input pattern that's brittle for automated testing.
**Why it might matter:** if you ever want Playwright / Cypress / Detox tests of the wizard, this textarea (and likely many others) won't be drivable without the React-aware setter dance. Real-world impact today: zero. Future-test impact: medium.
**Recommended fix:** this isn't a user-facing bug — just a note that the wizard hasn't been built with testing affordances. Adding `data-testid` attributes to all the wizard inputs would help when you do start writing e2e tests.

### M9. "Studio Ghibli" listed as an art style — trademark concern
**Page:** `/create/new` step 5
**Source:** seeded into `art_styles` table from `supabase/seed-art-styles.sql`
**Symptom:** one of the 9 art styles offered is labelled "Studio Ghibli". This is a registered trademark and trade name of Studio Ghibli, Inc. Using it as a public style label invites a takedown notice or worse — Ghibli has been historically protective about derivative AI-generated work in their style.
**Recommended fix:** rename to a descriptive phrase that captures the visual feel without invoking the trademark — e.g. "Soft Anime Landscapes", "Cozy Animated Wonder", "Hand-painted Animation". The underlying prompt can keep style language internally as long as the public-facing name doesn't trade on the brand.
**Effort:** S — DB seed edit + verify the prompt builder doesn't rely on the exact name.

### M10. Reference-photo upload accepts `.webp` despite the hint saying "JPG or PNG"
**Page:** `/characters/new` and `/create/new` step 4
**Symptom:** the upload widget hint reads "Click or drag an image. JPG or PNG." but the file `public/recipient-samples/pet.webp` was accepted without complaint. Either the hint is wrong or the validation is missing.
**Recommended fix:** decide which is correct (almost certainly: webp is fine — keep it). Update the hint to "JPG, PNG, or WebP." Also test HEIC (iPhone default format) — if HEIC isn't supported, the hint should say so and surface a friendlier client-side error than silent rejection.
**Effort:** XS — text edit.

### M11. User reference-photo URLs are in a public-read bucket with `user_id` in the path
**Page:** anywhere a user uploads a photo (characters, story memories)
**Source:** `uploads` Storage bucket, configured public-read per CLAUDE.md ("public read, writes only via service role")
**Symptom:** the character-portrait URL is `https://<project>.supabase.co/storage/v1/object/public/uploads/user-uploads/<user-uuid>/<file-uuid>.webp`. Two concerns:
1. The bucket is publicly readable, so anyone with the URL can view any user's uploaded pet photos without auth. The file UUIDs are unguessable so practical exposure is low.
2. The path leaks the user's Supabase UUID. Knowing one image URL tells you the user-id which is enough to attempt enumeration against any future signed endpoints that take `user_id` in the URL.
**Why it might matter:** for pets this is low-stakes. If the platform ever expands to include people's photos of kids (which the wizard step 1 already does — "My Child", "My Baby"), keeping kids' photos in a publicly-readable bucket is a much bigger problem.
**Recommended fix:** flip the bucket to private and serve each image via short-lived signed URLs (1-hour TTL) from a server route that checks `assertOwnsCharacter()` before signing. This is a meaningful refactor — flag as a discussion item, not a quick fix.
**Effort:** L (4-8h plus careful testing of all image-rendering paths: Studio, Reader, Approve gate, OG images, print PDF).

### M12. Story-progress + character-form pages POST to `/api/support/unread` on every render
**Page:** any signed-in page
**Symptom:** the network trace on the character-form page shows 5 hits to `/api/support/unread` in the span of ~5 seconds (reqid 553, 556, 562, 568, 572). Similarly the draft is PATCH'd 5 times during the same span. This is way more chatty than it needs to be.
**Why it matters:** every one of those requests hits Supabase + your Next.js handler. Multiply across all active users and it's a real cost driver, especially on Supabase's request-quota'd plans.
**Recommended fix:** debounce the draft PATCH to a max of 1/sec. Throttle `/api/support/unread` polling to e.g. 60s interval and pause when the tab is backgrounded (`document.visibilityState`).
**Effort:** S-M (≤ 1h).

---

## Studio & Reader & Print findings

### C2. Owner's own Studio editor view shows the "StoryInk" diagonal watermark on every page illustration
**Page:** `/canvas/<storyId>` (the owner's editor)
**Symptom:** the page art rendered in the Studio's center canvas is the *watermarked* version (the diagonal "StoryInk" wordmark plastered across the illustration in white). Visible in screenshot 31. The owner is editing their own paid-or-yet-to-be-paid story and the watermark is overlaid on the very art they're trying to lay out.
**Why this is critical:** the Studio is the editing surface. Asking a user to design page layouts on top of a heavy watermark is incoherent — they can't see what their actual print will look like, and the watermark covers exactly the area where text overlays will compose. Also psychologically off-brand: the platform is treating its own paying-to-be user like a stranger.
**Why I suspect it happens:** the schema has watermark columns (per CLAUDE.md "watermark_columns" migration). The Studio is probably reading from the watermarked URL by default rather than branching on whether the viewer is the owner.
**Recommended fix:** the Studio renderer must always use the un-watermarked image. The watermarked variant is reserved for `/read/<id>` when shown to an unpaid viewer (owner or otherwise) and the public-share preview.
**Effort:** S — likely a single conditional in the canvas image renderer.

### C3. Owner sees "Unlock for $9.99" paywall on `/read/<id>` of their OWN just-created story
**Page:** `/read/<storyId>` (after generation completes)
**Symptom:** after Buddy's Park Adventure finished generating, the success redirect lands on `/read/<id>` which shows: "PREVIEW · Buddy's Park Adventure · The first 3 pages — unlock the full story below." with watermarks on every page art and an "Unlock for $9.99" CTA. The user *just* created this story; presenting them with a paywall the moment generation finishes is jarring and feels like a bait-and-switch (the landing page promises "Free to generate — no credit card required").
**Why critical:** this is the very first thing a user sees after going through 7 wizard steps + waiting 2-3 min for generation. The implicit promise was "you can read your free book". The reality is "you can read 3 of 8 pages with watermarks and pay $9.99 to unlock."
**Recommended fix:** decide what the freemium policy actually is, then make the entire UX consistent with it. Three options:
1. **(Recommended for trust)** Free includes full reading online (with watermark), paid removes the watermark and adds PDF download. Update landing page to say "Free to read online — pay to download & remove watermarks."
2. **(Status quo, less honest)** Keep paywall but tell users about it BEFORE they spend 3 minutes generating. Add a clear "Read all pages: $9.99, Hardcover: $34.99+" disclosure on the wizard's Generate-book step 7 review screen.
3. **(Friendliest)** Free unlocks the just-generated story in full (one per account), paywall kicks in on the 2nd+ story.
**Effort:** S for option 2 (text edits + review-step disclosure). M for option 1 (renderer changes). L for option 3 (entitlement table + checks).

### H4. Wizard lets user pick 8 pages → dead-end at `/ship/<id>` ("hardcover not available for short stories")
**Page:** `/create/new` step 6 → eventually `/ship/<storyId>`
**Symptom:** the wizard's length step lets you pick `8` from the preset row (the smallest preset). A small grey note reads "Digital only — too short for hardcover" but the preset is otherwise un-styled-as-disabled, so most users will fly past it. Once the story is generated and they click "Order the hardcover", they hit a full-page dead end: "Hardcover isn't available for short stories. … You can still read it online or download it as a PDF. Want a hardcover? Regenerate this idea at 24+ pages." Regenerating loses any Studio edits and costs another Gemini run.
**Recommended fix:**
1. Disable the 8 and 16 presets visually (greyed + hover tooltip) when print is the desired outcome, OR
2. On step 6, surface a checkbox "I want a printable hardcover" — if checked, the slider min jumps to 24 with a clear "minimum for hardcover" inline note, AND
3. On the `/ship/<id>` dead-end, add a one-click "Extend this story to 24 pages" button that preserves Studio edits and only regenerates new pages.
**Effort:** S for #1+#2 (UI edits); M for #3 (extends the generation pipeline).

### L4. After generation, the success redirect goes to `/read/<id>` not `/canvas/<id>`
**Page:** post-generation routing
**Symptom:** the natural next step after generating a book is to edit it in the Studio — but the redirect goes to the Reader (paywall + watermark) view. Users have to manually click "Studio" in the nav to access the editor.
**Recommended fix:** redirect to `/canvas/<id>` after generation; reserve `/read/<id>` for explicit "read mode" navigation.
**Effort:** XS (single redirect target change).

### Notes on Ship/Admin
- `/admin` correctly 404s for the non-admin test user. Good (RLS/admin-check working).
- The 404 page itself ("That page wandered off") is well-designed — keep.
- I couldn't exercise the full print/ship Stripe flow because my 8-page story is below the 24-page minimum (see H4).

---

## Static code sweep — summary (full report: `static-sweep.md`)

Run by a parallel agent against the entire codebase per CLAUDE.md design-system rules.

- **Off-palette utilities:** 2 (`bg-white` in `login/page.tsx:414`; `bg-black/60` in `AIAssistantPreview.tsx:86`). H1 above is one of these.
- **Icon-only buttons missing `aria-label`:** 0 — the codebase is clean here. Notable.
- **Button-shape deviations:** **47 across 27 files.** The dominant pattern is **missing `focus-visible:ring-*` on primary CTAs (~25 of 47)** — CLAUDE.md explicitly forbids this.
- **`console.log`s + TODOs:** 2 + 2; both `console.log`s are `[print-pdf]` operational logs; both TODOs point at an unimplemented storage orphan sweep in `src/inngest/functions.ts:492` + `:575` (worth filing before launch).
- **Typos:** 0 across `src/`.

### High-leverage fixes called out by the sweep
1. **One-line fix that fixes every wizard Next button:** `src/components/wizard/StepShell.tsx:53-54` defines `nextClasses` which is consumed by every wizard step. Currently `rounded-xl px-6 py-2 font-medium` + no focus ring. Fix once → fixes all 7 wizard primary CTAs.
2. **All four `*/error.tsx` boilerplates** (`app/error.tsx`, `app/not-found.tsx`, `app/read/[id]/error.tsx`, `app/ship/[id]/error.tsx`) ship the same off-spec primary classString. Single search/replace.
3. **Destructive buttons consistently use a "loud" `bg-rose-600/700` saturated variant** that isn't in the CLAUDE.md spec. 4 sites: `CancelOrderButton.tsx:61`, `OrderStatusActions.tsx:129`, `AccountDeleteModal.tsx:141`, `WizardClient.tsx:1655`. Either codify a third "loud destructive" tier in the spec or normalize to the soft spec.
4. **Introduce a shared `Button.tsx`** with `variant` + `size` props — would collapse most of the 47 deviations and prevent the next 47.

See `reviews/2026-05-17/static-sweep.md` for the per-file list (lines, current classString, suggested fix).

---

## Notes / observations (not bugs)

- Landing page console is **clean** (no errors/warnings) — good baseline.
- Landing page palette compliance is **clean** — DOM scan found zero off-palette Tailwind utilities.
- Mobile landing layout (390×844) reflows cleanly.

---

## Severity legend
- **Critical** — broken, dataloss, security, or performance bug that hits every user.
- **High** — UX-breaking, accessibility blocker, or looks broken on first view.
- **Medium** — looks unpolished / off-palette / inconsistent / second-look issues.
- **Low** — nits, micro-copy, optional polish.
