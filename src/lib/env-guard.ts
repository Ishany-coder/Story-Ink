// Defensive runtime assertions on environment variables.
//
// Imported at the top of every checkout route so a misconfigured prod
// deploy hard-fails the request instead of silently giving away free
// books. The check is cheap and idempotent (the same env vars are
// already read on every request).

export function assertNoBypassInProd(): void {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.BYPASS_STRIPE === "1"
  ) {
    // Throwing here surfaces a 500 to the caller, which is exactly what
    // we want — better than letting the bypass path run.
    throw new Error(
      "Refusing to honor BYPASS_STRIPE in production. Unset the env var and redeploy."
    );
  }
}

// Hard-fail if the Stripe key doesn't match the runtime environment:
//   - `sk_live_…` in NODE_ENV !== "production" → almost certainly an
//      accident (test code about to hit the live Stripe account).
//   - `sk_test_…` in NODE_ENV === "production" → a live deploy that
//      can't actually charge real cards (silent revenue loss).
// Either is a serious bug; throw early so the misconfigure surfaces
// loudly instead of corrupting data or burning live API calls.
export function assertStripeKeyMatchesEnv(): void {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return; // missing-key error is raised elsewhere (stripe.ts)
  const isLive = key.startsWith("sk_live_");
  const isTest = key.startsWith("sk_test_");
  const isProd = process.env.NODE_ENV === "production";

  if (isLive && !isProd) {
    throw new Error(
      "Refusing to use a live Stripe key (sk_live_…) outside production. " +
        "Put sk_test_… in .env.local for development."
    );
  }
  if (isTest && isProd) {
    throw new Error(
      "Refusing to run production with a Stripe test key (sk_test_…). " +
        "Set STRIPE_SECRET_KEY to your sk_live_… key on the production deploy."
    );
  }
}
