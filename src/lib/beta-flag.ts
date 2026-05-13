// Closed-beta kill switch for the hardcover / paid surfaces.
//
// When the flag is on the app:
//   - 404s `/ship`, `/ship/[id]`, and the Stripe checkout APIs
//   - 404s `/api/digital/checkout`
//   - 404s `/my-orders` (no user orders to show while ordering is paused)
//   - hides every "Order hardcover" / "Print this book" / "$XX.XX"
//     CTA in the UI
//   - hides the "Ship" and "My orders" nav tabs
//   - auto-grants full reader access (treats `isBetaTesting()` as
//     equivalent to `digital_unlocked` in `src/app/read/[id]/page.tsx`)
//   - empties the sitemap and disallows all in robots.txt
//   - shows a small banner explaining hardcover orders are paused
//
// `/orders` (the admin queue) and `/admin/*` remain admin-gated by
// `isAdminUser` and are unaffected by the flag — admins keep visibility.
//
// Story generation, reading, and the Studio all keep working — beta
// testers exercise everything *except* the paid checkout funnel, and
// they get every story unlocked for free.
//
// Read from a single env var: `NEXT_PUBLIC_BETA_TESTING`. The
// `NEXT_PUBLIC_` prefix tells Next.js to inline the value into the
// client bundle at build time, so the same `isBetaTesting()` call
// works in both server components (where every env var is available)
// and client components (where only NEXT_PUBLIC_* vars are).
//
// A boolean kill-switch is not a secret — knowing the app is in
// closed-beta doesn't help an attacker. For anything that IS a secret
// (Stripe key, Supabase service-role key, Resend API key) keep the
// env var server-only — never prefix it with NEXT_PUBLIC_.

export function isBetaTesting(): boolean {
  return process.env.NEXT_PUBLIC_BETA_TESTING === "1";
}
