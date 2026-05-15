"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

// Landing page for the password-reset email link.
//
// Flow:
//   1. User clicks "Forgot password?" on /login and submits their email.
//   2. Supabase sends a recovery email whose link points to
//      /auth/callback?next=/auth/reset-password (via resetPasswordForEmail).
//   3. /auth/callback exchanges the code for a recovery session and
//      redirects here.
//   4. This page lets the user pick a new password and calls
//      supabase.auth.updateUser({ password }).
//   5. On success the user is redirected to /.

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  // The `error` query param is set by /auth/callback when code exchange fails.
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(callbackError ?? null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    setError(null);
    const supa = getSupabaseBrowser();
    const { error: err } = await supa.auth.updateUser({ password });
    if (err) {
      setError(err.message);
      setPending(false);
      return;
    }
    setDone(true);
    // Hard-navigate so the server picks up the refreshed session cookie.
    setTimeout(() => window.location.assign("/"), 1500);
  }

  return (
    <div className="animate-rise-in mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-16">
      <div className="w-full rounded-2xl border border-cream-300 bg-cream-50 px-8 py-10 shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
        <h1 className="mb-1 text-center font-[family-name:var(--font-display)] text-3xl font-semibold text-ink-900">
          Choose a new password
        </h1>
        <p className="mb-6 text-center text-sm text-ink-500">
          Pick something you&rsquo;ll remember.
        </p>

        {done ? (
          <div className="rounded-xl border border-cream-300 bg-cream-100 px-5 py-6 text-center">
            <p className="text-sm text-ink-700">
              Password updated! Redirecting you home…
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              autoComplete="new-password"
              className="w-full rounded-xl border border-cream-300 bg-cream-50 px-4 py-2.5 text-base text-ink-900 placeholder-ink-300 transition focus:border-moss-700 focus:outline-none focus:ring-4 focus:ring-moss-100/60"
            />
            <input
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              className="w-full rounded-xl border border-cream-300 bg-cream-50 px-4 py-2.5 text-base text-ink-900 placeholder-ink-300 transition focus:border-moss-700 focus:outline-none focus:ring-4 focus:ring-moss-100/60"
            />
            <button
              type="submit"
              disabled={pending || !password || !confirm}
              className="w-full rounded-full bg-moss-700 px-4 py-2.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save new password"}
            </button>
            {error && (
              <p className="text-center text-sm font-medium text-rose-600">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
