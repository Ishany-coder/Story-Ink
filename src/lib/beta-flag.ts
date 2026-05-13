// Closed-beta kill switch for the hardcover / paid surfaces.
//
// When the flag is on the app should:
//   - 404 the `/ship/[id]` page and the Stripe checkout API
//   - hide every "Order hardcover" / "Print this book" / "$XX.XX" CTA
//     in the UI
//   - show a small banner explaining hardcover orders are paused
//
// Story generation, reading, and the Studio all keep working — beta
// testers exercise everything *except* the paid checkout funnel.
//
// The flag is read from two env vars so the same value can be checked
// on the server and in a client component without prop-drilling:
//
//   - BETA_TESTING            — server-only. Set this in production /
//                               the host's secret store.
//   - NEXT_PUBLIC_BETA_TESTING — exposed to the client bundle by
//                               Next.js. Mirror BETA_TESTING in
//                               .env.local / Vercel so the client UI
//                               and server gating agree.
//
// `isBetaTesting()` returns true if *either* is set, so server code
// only needs to set BETA_TESTING and client code falls back to the
// public mirror. The two should be kept in sync in any real
// environment — divergence would mean the API rejects checkout while
// the UI still shows the button (acceptable: 404 is a safe failure
// mode).

export function isBetaTesting(): boolean {
  return (
    process.env.BETA_TESTING === "1" ||
    process.env.NEXT_PUBLIC_BETA_TESTING === "1"
  );
}
