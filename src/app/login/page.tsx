"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

// Email + password auth. Single page with a sign-in / sign-up toggle.
//
// Supabase Auth keys users by email — the "username" here is the email
// address. Email confirmation should be DISABLED in the Supabase
// dashboard (Authentication → Providers → Email → uncheck "Confirm
// email") so new signups land logged-in. If you turn confirmation back
// on, signUp returns no session and the form surfaces a "check your
// inbox" hint rather than silently redirecting an unauthenticated user.
//
// TODO: password reset flow. For now, blow away the user in the
// Supabase dashboard if they forget.

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmailNotice, setConfirmEmailNotice] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setPending(true);
    setError(null);
    setConfirmEmailNotice(false);

    const supa = getSupabaseBrowser();

    if (mode === "signin") {
      const { error: err } = await supa.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(err.message);
        setPending(false);
        return;
      }
    } else {
      const { data, error: err } = await supa.auth.signUp({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(err.message);
        setPending(false);
        return;
      }
      // Email confirmation enabled in dashboard → no session is issued
      // on signup. Don't pretend the user is signed in.
      if (!data.session) {
        setConfirmEmailNotice(true);
        setPending(false);
        return;
      }
    }

    // The browser client has written the auth cookie; refresh() makes
    // server components re-fetch with the new session before push lands.
    router.refresh();
    router.push(next);
  }

  function flipMode(to: Mode) {
    setMode(to);
    setError(null);
    setConfirmEmailNotice(false);
  }

  return (
    <div className="animate-rise-in mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col items-center justify-center px-6 py-16">
      <div className="w-full rounded-2xl border border-stone-200 bg-white px-8 py-10 shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
        <h1 className="mb-1 text-center font-[family-name:var(--font-display)] text-3xl font-semibold text-slate-900">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          {mode === "signin"
            ? "Welcome back."
            : "Pick a password and you're in."}
        </p>

        {confirmEmailNotice ? (
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-5 py-6 text-center">
            <p className="text-sm text-slate-700">
              Check your inbox at{" "}
              <span className="font-semibold text-slate-900">{email}</span> to
              confirm.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Tip: disable &ldquo;Confirm email&rdquo; in your Supabase
              dashboard (Authentication → Providers → Email) to skip this
              step in dev.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-base text-slate-900 placeholder-slate-400 transition focus:border-purple-400 focus:outline-none focus:ring-4 focus:ring-purple-100"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-base text-slate-900 placeholder-slate-400 transition focus:border-purple-400 focus:outline-none focus:ring-4 focus:ring-purple-100"
            />
            <button
              type="submit"
              disabled={pending || !email.trim() || !password}
              className="w-full rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending
                ? mode === "signin"
                  ? "Signing in…"
                  : "Creating account…"
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </button>
            {error && (
              <p className="text-center text-sm font-medium text-rose-600">
                {error}
              </p>
            )}
          </form>
        )}

        <div className="mt-6 text-center text-sm text-slate-500">
          {mode === "signin" ? (
            <>
              New here?{" "}
              <button
                type="button"
                onClick={() => flipMode("signup")}
                className="font-medium text-purple-600 hover:text-purple-700"
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => flipMode("signin")}
                className="font-medium text-purple-600 hover:text-purple-700"
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
