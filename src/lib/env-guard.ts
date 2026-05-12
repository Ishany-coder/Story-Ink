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
