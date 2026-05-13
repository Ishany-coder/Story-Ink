"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
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

// Reject non-relative or protocol-relative `next` values so a phishing
// link can't bounce a freshly-signed-in user to an attacker host.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  if (raw.startsWith("/\\")) return "/";
  return raw;
}

// Next.js 16 prerender requires useSearchParams consumers to live inside
// a Suspense boundary. Wrap the form so the page itself can statically
// render the shell while the search-params-dependent part hydrates.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // COPPA age gate. Signup is contractually 13+ per our Terms — we ask
  // for explicit affirmation at the only place a new account can be
  // created. This is a self-attestation, not verification; that's the
  // standard SaaS posture. Reset every time the user flips into signup.
  const [confirmedAdult, setConfirmedAdult] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmailNotice, setConfirmEmailNotice] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    // Belt-and-suspenders: the submit button is also disabled when this
    // is false in signup mode, but guard here too in case a future edit
    // forgets the disabled prop.
    if (mode === "signup" && !confirmedAdult) {
      setError("Please confirm you're 13 or older to create an account.");
      return;
    }
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

    // The browser client has written the auth cookie. Use a hard
    // navigation (not router.push) so the server reads the new cookie
    // when rendering the next page — otherwise the navbar etc. flash
    // signed-out until the next refresh.
    window.location.assign(next);
  }

  function flipMode(to: Mode) {
    setMode(to);
    setError(null);
    setConfirmEmailNotice(false);
    // Don't carry the 13+ tick across modes — flipping back to signup
    // should re-prompt for the affirmation.
    setConfirmedAdult(false);
  }

  return (
    <div className="animate-rise-in mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-16">
      <div className="w-full rounded-2xl border border-cream-300 bg-cream-50 px-8 py-10 shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
        <h1 className="mb-1 text-center font-[family-name:var(--font-display)] text-3xl font-semibold text-ink-900">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p className="mb-6 text-center text-sm text-ink-500">
          {mode === "signin"
            ? "Welcome back."
            : "Pick a password and you're in."}
        </p>

        {confirmEmailNotice ? (
          <div className="rounded-xl border border-cream-300 bg-cream-100 px-5 py-6 text-center">
            <p className="text-sm text-ink-700">
              Check your inbox at{" "}
              <span className="font-semibold text-ink-900">{email}</span> to
              confirm.
            </p>
            <p className="mt-2 text-xs text-ink-500">
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
              className="w-full rounded-xl border border-cream-300 bg-cream-50 px-4 py-2.5 text-base text-ink-900 placeholder-ink-300 transition focus:border-moss-700 focus:outline-none focus:ring-4 focus:ring-moss-100/60"
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
              className="w-full rounded-xl border border-cream-300 bg-cream-50 px-4 py-2.5 text-base text-ink-900 placeholder-ink-300 transition focus:border-moss-700 focus:outline-none focus:ring-4 focus:ring-moss-100/60"
            />
            {mode === "signup" && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-cream-300 bg-cream-100/60 px-4 py-3 text-sm text-ink-700 transition-colors hover:border-cream-400">
                <input
                  type="checkbox"
                  checked={confirmedAdult}
                  onChange={(e) => setConfirmedAdult(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-moss-700"
                />
                <span>
                  I confirm I&rsquo;m at least 13 years old. StoryInk
                  isn&rsquo;t available to children under 13. Under-13
                  accounts may be removed without notice.
                </span>
              </label>
            )}
            <button
              type="submit"
              disabled={
                pending ||
                !email.trim() ||
                !password ||
                (mode === "signup" && !confirmedAdult)
              }
              className="w-full rounded-full bg-moss-700 px-4 sm:px-6 lg:px-8 py-2.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 disabled:cursor-not-allowed disabled:opacity-50"
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

        <div className="mt-6 text-center text-sm text-ink-500">
          {mode === "signin" ? (
            <>
              New here?{" "}
              <button
                type="button"
                onClick={() => flipMode("signup")}
                className="font-medium text-moss-700 hover:text-ink-900"
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
                className="font-medium text-moss-700 hover:text-ink-900"
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
