# Static code sweep — 2026-05-17

Read-only audit of the StoryInk codebase against the design-system rules in
`CLAUDE.md` (palette + button shapes). Studio files
(`src/components/CanvasEditor.tsx`, `src/components/studio/**`) and the
documented memorial section of `src/components/LandingPage.tsx` are excluded
per CLAUDE.md exceptions.

## Summary

- Off-palette violations: **2** (across 2 files)
- Icon-only buttons missing `aria-label`: **0**
- Button-shape deviations: **47 buttons/Links** (across 27 files)
- Console.logs / TODOs / typos: **4** (2 `console.log` + 2 TODO comments; 0 typos)

The codebase is in good shape on palette discipline — the only true
off-palette utilities are `bg-white` and `bg-black/60`. The big debt is in
button-shape consistency: the spec mandates inline-flex + focus rings + a
fixed px/py table, and dozens of CTAs predate that spec (or were authored
before the spec was tightened). The single most common deviation, by far, is
**missing focus-visible ring** on `bg-moss-700` primary CTAs.

---

## Sweep 1: Off-palette utilities

Only 2 hits in the whole brand surface. Both are isolated bugs, not
patterns.

### src/app/login/page.tsx
- **L414** `bg-white` → `bg-cream-50` — Google sign-in button. Context:
  ```
  className="flex w-full items-center justify-center gap-3 rounded-full
  border border-cream-300 bg-white px-4 py-2.5 text-sm font-semibold
  text-ink-700 shadow-sm transition-colors hover:bg-cream-100 ..."
  ```

### src/components/AIAssistantPreview.tsx
- **L86** `bg-black/60` → `bg-ink-900/60` — modal backdrop. Context:
  `<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">`
  Convention elsewhere in the codebase is `bg-ink-900/40` (see
  `AccountDeleteModal.tsx:68`, `MobileMenu.tsx:167`, `LegalConsentModal.tsx:120`).
  Note: this file is functionally a Studio sub-panel (it is rendered only
  from `AIAssistantPanel.tsx`, which is rendered only from `CanvasEditor.tsx`).
  The CLAUDE.md Studio exception currently only names `CanvasEditor.tsx` and
  `src/components/studio/**` explicitly — so under the literal wording this
  is a violation. Two reasonable fixes: (a) move
  `AIAssistantPanel.tsx` + `AIAssistantPreview.tsx` into `src/components/studio/`,
  or (b) just swap to `bg-ink-900/60`.

(Note: `LandingPage.tsx` lines 126, 129, 395, 397, 403 use `indigo-*` —
these are all inside the documented "Memorial" sample card and
`MemorialSection()` and are explicitly exempted by CLAUDE.md.)

---

## Sweep 2: Icon-only buttons missing aria-label

None found. Every icon-only `<button>` checked has an `aria-label` or
`aria-labelledby`. Confirmed coverage on:
- `AdminQuickCancelButton.tsx:54` (`aria-label="Cancel order"`)
- `BookCard.tsx:111` (`aria-label={`Delete ${title}`}`)
- `ResumeDraftCard.tsx:222` (`aria-label={`Delete draft ${title}`}`)
- `CharacterForm.tsx:283` (`aria-label="Remove photo"`), `:324`
- `SlideReader.tsx:140/153/216/236/266` (close, back, prev, next, paginator dots)
- `HelpChat.tsx:133` (`aria-label="Send"`)
- `AdminSupportInbox.tsx:217` (`aria-label="Send reply"`)
- `AIAssistantPreview.tsx:107` (`aria-label="Close preview"`)
- `ShipStoryPage.tsx:264/278` (quantity − / +)
- `MobileMenu.tsx:149/165` (open/close menu)
- `WizardClient.tsx:620/671/696/725/1531` (character select/edit/delete/add, remove memory photo)
- `CookieConsent.tsx:108`, `SupportChatLauncher.tsx:70/81`

---

## Sweep 3: Button-shape deviations

Pattern legend (the spec, from CLAUDE.md "Buttons"):
- **Primary** must include: `inline-flex items-center gap-1.5 rounded-full
  bg-moss-700 shadow-sm transition-colors text-cream-50 font-semibold
  hover:bg-moss-900 focus-visible:outline-none focus-visible:ring-2
  focus-visible:ring-moss-500 focus-visible:ring-offset-2 disabled:opacity-50
  disabled:cursor-not-allowed` + one of (`px-3 py-1.5 text-xs` /
  `px-5 py-2.5 text-sm` / `px-6 py-3 text-base`).
- **Secondary** spec: `rounded-full border border-cream-300 bg-cream-50
  text-ink-700 hover:bg-cream-100 hover:border-cream-400` + shadow + transition + focus ring (moss-500).
- **Destructive** spec: `rounded-full border border-rose-300 bg-rose-50
  text-rose-600 hover:bg-rose-100 hover:border-rose-400` + focus ring (rose-300).

Each violation lists: file:line, button purpose, deviations, suggested fix.

### src/app/error.tsx
- **L43** "Try again" button (primary). Drops `inline-flex items-center gap-1.5`, drops the entire focus-visible ring (`outline-none`/`ring-2`/`ring-moss-500`/`ring-offset-2`), drops `disabled:opacity-50 disabled:cursor-not-allowed`, uses `py-2` instead of `py-2.5`. → adopt the canonical md primary classString.

### src/app/not-found.tsx
- **L24** "Back home" `<Link>` (primary). Same set as above: missing inline-flex, focus ring, disabled, and uses `py-2`. → adopt canonical md primary.

### src/app/page.tsx
- **L67** "Create a book" hero `<Link>` (primary, lg size — `px-6 py-3 text-base`). Missing focus ring + disabled pair. → add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed`.
- **L167** "Character chip" `<Link>` (secondary). Missing focus ring, missing `shadow-sm`, uses `py-2` (not in spec). → either adopt sm secondary (`px-3 py-1.5 text-xs`) or md secondary (`px-5 py-2.5 text-sm`).
- **L203** "Create new story" `<Link>` (primary, md). Missing focus ring + disabled pair. → add focus ring + disabled.

### src/app/auth/reset-password/page.tsx
- **L96** "Save new password" submit (primary). Missing inline-flex, missing focus ring, uses `w-full px-4 py-2.5` (px-4 not in spec). → use canonical md primary, drop `w-full` or accept it as utility addition; replace `px-4` with `px-5`.

### src/app/read/page.tsx
- **L58** "Back home" `<Link>` (primary). Missing `disabled:opacity-50 disabled:cursor-not-allowed`. → add disabled pair (cosmetic for a Link, but spec requires it on the className).
- **L104** "Read a public sample" `<Link>` (primary). Same — missing disabled pair.

### src/app/read/[id]/error.tsx
- **L43** "Try again" (primary). Same set as `src/app/error.tsx:43`. → canonical md primary.

### src/app/ship/[id]/error.tsx
- **L42** "Try again" (primary). Same as above. → canonical md primary.

### src/app/ship/[id]/success/page.tsx
- **L54** "Read your story" `<Link>` (primary). Missing disabled pair.
- **L109** "View order" `<Link>` (primary). Missing disabled pair.
- **L116** "Read book" `<Link>` (secondary). Missing `shadow-sm`. → add `shadow-sm`.

### src/app/my-orders/page.tsx
- **L137** "Browse stories" `<Link>` (primary). Missing inline-flex, items-center, gap-1.5, full focus ring, disabled pair, and `py-2` not in spec. → canonical md primary.
- **L233** "Read" `<Link>` (secondary, sm). Missing `hover:border-cream-400`, full focus ring, `shadow-sm`, `transition-colors`. → canonical sm secondary.

### src/app/orders/page.tsx
- **L185** "View order" `<Link>` (secondary, sm). Missing `hover:border-cream-400`, focus ring, `shadow-sm`, `transition-colors`. → canonical sm secondary.
- **L243** "View order" `<Link>` (secondary). Same as above + uses `py-1` (not in `{py-1.5,py-2.5,py-3}`). → canonical sm secondary.

### src/app/orders/[id]/page.tsx
- **L237** "Interior PDF" `<a>` (primary, mis-sized). Drops inline-flex/items-center/gap-1.5, missing `shadow-sm`, missing full focus ring + disabled pair, uses `px-4 py-2 text-xs`. → canonical sm primary (`px-3 py-1.5 text-xs`).
- **L243** "Cover PDF" `<a>` (secondary, mis-sized). Missing `hover:border-cream-400`, focus ring, `shadow-sm`, `transition-colors`, uses `px-4 py-2`. → canonical sm secondary.

### src/app/canvas/page.tsx
- **L129** "Start a new book" `<Link>` (primary). Drops inline-flex/items-center/gap-1.5, missing focus ring + disabled pair, uses **responsive padding** `px-4 sm:px-6 lg:px-8` (CLAUDE.md says "Do not use responsive padding; pick one size for the surface"). → choose md primary and drop the responsive override.

### src/app/ship/page.tsx
- **L107** "Start a new book" `<Link>` (primary). Same responsive-padding pattern as `canvas/page.tsx:129`. → same fix.

### src/app/blog/[slug]/page.tsx
- **L232** "Create your storybook" `<Link>` (primary). Missing focus ring + disabled pair, uses `px-4 py-2`. → canonical md primary (`px-5 py-2.5 text-sm`).

### src/app/account/AccountActions.tsx
- **L65** "Delete my account" (destructive). Missing `hover:border-rose-400`. → add `hover:border-rose-400`. (Otherwise this is the cleanest destructive button in the codebase — keep as the reference.)

### src/app/characters/page.tsx
- **L19** "Create character" `<Link>` (primary). Missing `disabled:opacity-50 disabled:cursor-not-allowed`.
- **L33** Same on the empty-state CTA.

### src/app/login/page.tsx
- **L414** Google sign-in (palette violation already covered in Sweep 1: `bg-white`). Also off-spec shape: uses `flex` instead of `inline-flex`, uses `px-4` (not in spec), no focus ring. Treat as a Google brand button — Google's brand guidelines actually require a white surface, so this may be an intentional deviation, but it should at minimum get a focus ring.
- **L502** Submit ("Sign in" / "Create account" / "Send reset link") primary. Missing inline-flex/items-center/gap-1.5, missing focus ring, uses `w-full px-6 py-2.5` (px-6 is the lg size — pair `px-6 py-2.5 text-sm` is not a defined size combination, only `px-6 py-3 text-base`). → If this is the lg hero submit, use `px-6 py-3 text-base`; otherwise switch to md (`px-5 py-2.5 text-sm`). Add the focus ring either way.

### src/app/help/page.tsx
- **L42** "Email support" `<a>` (primary). Missing `gap-1.5` (uses `gap-2`), full focus ring, disabled pair; `px-4 py-2 text-sm` not in spec. → canonical md primary.
- **L66** "Sign in" `<Link>` (secondary). Missing `hover:bg-cream-100`, focus ring, shadow; `px-4 py-2 text-sm` not in spec. → canonical md secondary.

### src/components/Navbar.tsx
- **L50** "New story" `<Link>` (primary, sm). Uses `transition-all` (should be `transition-colors`), missing focus ring + disabled pair, uses `px-4 py-1.5 text-sm` (sm size is `px-3 py-1.5 text-xs`; if md, then `px-5 py-2.5`). → pick sm primary and replace classes accordingly.
- **L60** Sign-out button (secondary, sm). Uses `text-ink-500` instead of `text-ink-700`, `hover:bg-cream-200` instead of `hover:bg-cream-100`, no focus ring. → canonical sm secondary.
- **L78** "Sign in" `<Link>` (primary, sm). Missing inline-flex/items-center/gap-1.5, missing focus ring + disabled pair, uses `px-4 py-1.5 text-sm`. → canonical sm primary (`px-3 py-1.5 text-xs`) or md primary.

### src/components/MobileMenu.tsx
- **L145** menu toggle button (icon-only secondary). Missing `hover:bg-cream-100` (uses `hover:bg-cream-200`), missing `hover:border-cream-400`, missing focus ring, missing `shadow-sm`. Otherwise an icon container — keep its h/w but align hover + focus.
- **L195** "Create a new book" `<Link>` (primary, lg). Missing `gap-1.5` (uses `gap-2`), full focus ring, disabled pair, `px-4` not in spec. → canonical lg primary (`px-6 py-3 text-base`).
- **L201** Account-status / sign-out row `<button>` (secondary). Uses `rounded-2xl` instead of `rounded-full`, `text-ink-500` not `text-ink-700`, `hover:bg-cream-200` not `hover:bg-cream-100`, missing `hover:border-cream-400`, missing focus ring, `px-4` not in spec. → restructure to canonical secondary (or accept as menu-row idiom and document an exception).

### src/components/OrderStatusActions.tsx
- **L129** "Cancel order" confirm (destructive). Uses `bg-rose-600 text-cream-50` — wrong variant; spec destructive is the soft `bg-rose-50 text-rose-600 border-rose-300`. → swap to canonical destructive shape (sm size).
- **L137** "Keep it" cancel (secondary, sm). Missing `hover:border-cream-400`, focus ring, `shadow-sm`, `transition-colors`. → canonical sm secondary.

### src/components/CancelOrderButton.tsx
- **L46** "Cancel order" trigger (destructive). Uses `border-rose-200` (should be `border-rose-300`) and `bg-cream-50` (should be `bg-rose-50`); missing `hover:bg-rose-100`, `hover:border-rose-400`, focus ring. → canonical sm destructive.
- **L61** "Yes, cancel" confirm (destructive). Uses `bg-rose-600 text-cream-50 px-3 py-1` — wrong variant + `py-1` not in spec. → canonical sm destructive (`bg-rose-50 text-rose-600 px-3 py-1.5 text-xs`).
- **L69** "Keep it" (secondary, sm). Missing `hover:border-cream-400`, focus ring, `shadow-sm`, `transition-colors`; uses `py-1`. → canonical sm secondary.

### src/components/AdminQuickCancelButton.tsx
- **L49** icon "Cancel order" (destructive icon button). Missing `border-rose-300` (uses `border-rose-200`), `bg-rose-50`, `hover:bg-rose-100`, `hover:border-rose-400`, focus ring. Icon button so `gap-1.5`/text classes don't apply — but should still align colors + focus ring with destructive spec.

### src/components/CharacterForm.tsx
- **L335** "Delete character" (destructive). Uses `border-rose-200` not `border-rose-300`, `bg-cream-50` not `bg-rose-50`; missing `hover:bg-rose-100`, `hover:border-rose-400`, focus ring; uses `px-4 py-2` (not in spec). → canonical md destructive.

### src/components/AccountDeleteModal.tsx
- **L141** modal confirm "Delete my account" (destructive). Uses `bg-rose-700 text-cream-50 px-5 py-2` — saturated solid variant, not the soft spec; `py-2` not in spec. → canonical md destructive. (Note: this is the second click of a double-confirm, so a louder visual is defensible, but the spec doesn't include a third "loud destructive" variant — either revise the spec or align the button.)

### src/components/AIAssistantPreview.tsx
- **L86** `bg-black/60` modal backdrop (already in Sweep 1).
- **L512** "Run" CTA inside the preview (primary). Missing inline-flex/items-center/gap-1.5, full focus ring, `disabled:opacity-50` (uses `disabled:opacity-60`); `py-2` not in spec. → canonical md primary. Also see the Studio-adjacency note in Sweep 1 — if this file is moved under `src/components/studio/`, it's exempt instead.

### src/components/ShipSuccessConfirm.tsx
- **L99** "Read your story" `<Link>` (primary). Missing disabled pair.
- **L119** "Order again" `<Link>` (secondary). Missing `shadow-sm`. → add `shadow-sm`.

### src/components/ShipStoryPage.tsx
- **L258** "−" quantity (icon secondary). Missing `hover:border-cream-400` (uses `hover:border-moss-500`), focus ring, `shadow-sm`. Icon button so size constraints n/a — align hover + focus.
- **L272** "+" quantity. Identical issues to L258.
- **L364** "Pay with Stripe" submit (primary, full-width). Missing inline-flex/items-center/gap-1.5, full focus ring; `w-full px-4 py-3 text-sm` — mixed lg `py-3` with sm-ish `px-4 text-sm` (not a spec size combination). → canonical md primary (`px-5 py-2.5 text-sm`) or lg primary (`px-6 py-3 text-base`).
- **L583** "Unlock digital" (primary, lg). Missing `gap-1.5` (uses `gap-2`), full focus ring. → canonical lg primary.

### src/components/DigitalUpsell.tsx
- **L119** "Unlock for $N" (primary, lg). Missing `gap-1.5` (uses `gap-2`), full focus ring. → canonical lg primary.

### src/components/HelpChat.tsx
- **L130** "Send" icon submit (primary icon button). Missing inline-flex, gap-1.5, `shadow-sm`, `font-semibold`, full focus ring. Icon-only, so size pair doesn't apply; align rest with primary tokens.

### src/components/AdminSupportInbox.tsx
- **L214** "Send reply" icon submit (primary icon button). Same shape as HelpChat:130 — missing inline-flex, gap-1.5, shadow, font-semibold, focus ring.

### src/components/AdminExportPdfButton.tsx
- **L54** "Interior PDF" (primary, sm-ish). Missing gap-1.5, `shadow-sm`, full focus ring, `disabled:opacity-50` (uses `disabled:opacity-60`); `px-4 py-2 text-xs` — not in spec. → canonical sm primary (`px-3 py-1.5 text-xs`).
- **L63** "Cover PDF" (secondary). Missing `hover:border-cream-400`, focus ring, `shadow-sm`; `px-4 py-2 text-xs`. → canonical sm secondary.

### src/components/CookieConsent.tsx
- **L132** "Accept" (primary). Missing inline-flex/items-center/gap-1.5, focus ring, disabled pair; `px-4 py-2 text-xs` not in spec. → canonical sm primary.

### src/components/StoryGeneratingScreen.tsx
- **L72** "Back to creating" `<Link>` (primary). Missing inline-flex/items-center/gap-1.5, `shadow-sm`, focus ring, disabled pair; `py-2` not in spec. → canonical md primary.
- **L78** "Read library" `<Link>` (secondary). Missing `hover:bg-cream-100`, `hover:border-cream-400`, focus ring, `shadow-sm`; `py-2` not in spec. → canonical md secondary.

### src/components/LandingPage.tsx
- **L84** Hero "Start your free book" `<Link>` (primary, lg). Missing inline-flex/items-center/gap-1.5, focus ring, disabled pair; uses `px-8 py-3` (px-8 not in spec, spec lg is `px-6 py-3`). → canonical lg primary.
- **L90** "How it works" `<a>` (secondary, lg). Missing `hover:bg-cream-100`, `hover:border-cream-400`, focus ring, `shadow-sm`; `px-8` not in spec. → canonical lg secondary (`px-6 py-3 text-base`).
- **L505** Closing-section CTA "Start your free book" `<Link>` (primary, lg). Same set as L84. → canonical lg primary.

### src/components/SlideReader.tsx
- **L176** "Order print" pill `<Link>` (primary, custom). Missing almost everything: inline-flex/items-center/gap-1.5, transition-colors, font-semibold (uses `font-black`), hover:bg-moss-900, focus ring, disabled pair; uses `py-1` (not in spec) and uses `uppercase tracking-wider text-xs` styling that doesn't match the canonical primary. This looks like a "pill / chip" overlay rather than a canonical CTA — either spec a new pill variant or shrink it to canonical sm primary.

### src/components/LegalConsentModal.tsx
- **L212** "Agree and continue" modal CTA (primary). Missing inline-flex/items-center/gap-1.5, full focus ring; `py-2` not in spec. → canonical md primary.

### src/components/wizard/StepShell.tsx
- **L53** `nextClasses` prominent variant ("Generate book" CTA). Uses `rounded-xl` (should be `rounded-full`), `px-8 py-3 text-base` (px-8 not in spec; spec lg is `px-6 py-3`), missing inline-flex/items-center/gap-1.5, missing focus ring, missing `shadow-sm` (uses custom shadow). → canonical lg primary.
- **L54** `nextClasses` default variant (every wizard "Next" button). Uses `rounded-xl` (should be `rounded-full`), `px-6 py-2` (py-2 not in spec; spec is `px-5 py-2.5` for md), uses `font-medium` (spec is `font-semibold`), missing inline-flex/items-center/gap-1.5, missing focus ring, missing `shadow-sm`. → canonical md primary. (High impact — this is the styling for **every** wizard Next button.)

### src/components/wizard/WizardClient.tsx
- **L423** Recipient chip toggle. This is a selector chip rather than a CTA — its active state happens to be `bg-moss-100` (not `bg-moss-700`), so it falls outside the three-variant spec entirely. Either document a "selector chip" variant in CLAUDE.md or align with the existing selection-chip idiom on `L539` (the occasion grid).
- **L891** Page-count selector chip. Same selector-chip pattern: when selected → `bg-moss-700 text-cream-50` (so the script flagged it as primary), but it's really a radio-group chip. Same disposition as L423.
- **L1655** Delete-character modal confirm (destructive). Uses `rounded-xl`, `bg-rose-600 text-cream-50 px-5 py-2`, missing the entire destructive spec. → canonical md destructive (`bg-rose-50 text-rose-600 border-rose-300 rounded-full hover:bg-rose-100 hover:border-rose-400 + focus ring`).

---

## Sweep 4: Console.logs / TODOs / typos

### Console.log (potential debug leftovers)

- `src/lib/print-pdf.ts:80` — `console.log("[print-pdf] embedded fonts (subset):", ...)` — logs once per PDF build. Tagged with `[print-pdf]` prefix so this looks intentional, but it is verbose and could be downgraded to `console.debug` or removed for production. Low urgency.
- `src/lib/print-pdf.ts:221` — `console.log("[print-pdf] image upscaled (...): ...")` — also tagged + intentional-looking. Same disposition.

All other `console.*` calls in `src/` are `console.warn` / `console.info` in clearly intentional contexts (error reporting, init log, fetch fallbacks). Not flagged.

### TODO / FIXME / XXX / HACK comments

- `src/inngest/functions.ts:492` — `//   3. (TODO) Storage orphan sweep — walk uploads bucket and delete ...`
- `src/inngest/functions.ts:575` — `// 3. Storage orphan sweep — TODO (see header comment).`

Both refer to the same unimplemented step in the account-deletion Inngest function. One real TODO, one cross-reference comment. Worth filing as a tracked task before launch.

No FIXME / XXX / HACK comments anywhere in `src/`.

### Typos in user-visible strings

None found. Ran `recieve|occured|seperate|teh|wich|definately|untill|begining|sucessful|priviledge|accomodate|neccessary|truely|wierd|alot|lenght|occurence|writting|comming` across the whole `src/` tree — clean.

(`cancelled` is used heavily but is valid British English / a stable enum value in the orders state machine — not a typo.)

---

## Effort guesses

- **Sweep 1 (off-palette):** 2 line edits. Effort: **S**.
- **Sweep 2 (aria-label):** zero — already compliant. Effort: **none**.
- **Sweep 3 (button shapes):** ~47 buttons across 27 files. Most fixes are copy-paste of the canonical classString. The high-leverage win is `wizard/StepShell.tsx:51-54` because that single `nextClasses` string powers every wizard step's primary CTA. Also `LandingPage.tsx` and the four `*/error.tsx` boilerplates can be normalized in one pass. Effort: **M** if mechanical, **L** if you also want to introduce a `Button.tsx` component and migrate to it (recommended — would prevent the next 47 deviations).
- **Sweep 4 (debug/TODO):** 0 critical findings. The two `console.log`s in `print-pdf.ts` could be downgraded; the two TODO comments are tracked already inside the file. Effort: **S** or skip.

**Total auto-fixable findings: ~49 (2 off-palette + 47 button shapes).** A
shared `<Button variant="primary|secondary|destructive" size="sm|md|lg" />`
component would collapse most of this debt and prevent recurrence.

### Patterns observed

1. **The single most common deviation is "primary CTA drops the focus
   ring."** CLAUDE.md explicitly calls this out as "Do not drop the focus
   ring without replacing it," yet ~25 primary buttons/Links across the
   codebase ship without `focus-visible:ring-*`. This is the highest-value
   single-rule cleanup.
2. **Wizard buttons all share one bad shape.** `wizard/StepShell.tsx`
   defines `nextClasses` once (`rounded-xl px-6 py-2 font-medium`, no focus
   ring) and that string is consumed by every wizard step. Fixing one
   constant fixes the entire wizard.
3. **Error boilerplates are identical and identically wrong.**
   `app/error.tsx`, `app/read/[id]/error.tsx`, `app/ship/[id]/error.tsx`,
   and `app/not-found.tsx` all use the same `rounded-full bg-moss-700 px-5
   py-2 text-sm font-semibold text-cream-50 shadow-sm transition-colors
   hover:bg-moss-900` — missing the focus ring + disabled pair + uses
   `py-2`. Single search-and-replace.
4. **Destructive variant is consistently the "loud" version, not the spec
   "soft" version.** `CancelOrderButton.tsx:61`, `OrderStatusActions.tsx:129`,
   `AccountDeleteModal.tsx:141`, `WizardClient.tsx:1659` all use saturated
   `bg-rose-600`/`bg-rose-700` solids with `text-cream-50`. The spec
   destructive is `bg-rose-50 text-rose-600 border-rose-300`. Either every
   one of these implementations was authored before the spec, or there's a
   real need for a "loud destructive" third tier that the spec doesn't
   formalize — worth a design conversation, not just a mechanical fix.
5. **`px-4` is the most common off-spec padding.** Used by 12+ buttons.
   Spec only allows `px-3` / `px-5` / `px-6`. Same with `py-2` (12+ uses)
   vs spec `py-1.5` / `py-2.5` / `py-3`.
6. **`AccountActions.tsx:61` is the cleanest primary button in the
   codebase** and `ApproveCastClient.tsx:209` is the cleanest lg primary.
   Use these as references when normalizing.
7. **AIAssistantPanel.tsx + AIAssistantPreview.tsx are Studio sub-panels
   that live outside `src/components/studio/`.** They're rendered only by
   `CanvasEditor.tsx`. CLAUDE.md's exception wording could be interpreted
   either way. Moving them under `studio/` would resolve the ambiguity and
   silence ~3 findings.
