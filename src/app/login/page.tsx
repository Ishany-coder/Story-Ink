"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

// Email + password auth. Single page with a sign-in / sign-up / forgot-password toggle.
//
// Supabase Auth keys users by email — the "username" here is the email
// address. Email confirmation should be DISABLED in the Supabase
// dashboard (Authentication → Providers → Email → uncheck "Confirm
// email") so new signups land logged-in. If you turn confirmation back
// on, signUp returns no session and the form surfaces a "check your
// inbox" hint rather than silently redirecting an unauthenticated user.
//
// Google OAuth: enable the Google provider in the Supabase dashboard
// (Authentication → Providers → Google) and supply your Google OAuth
// client ID + secret. The redirect URL to whitelist in Google Cloud is
// <your Supabase project URL>/auth/v1/callback.

type Mode = "signin" | "signup" | "forgot";

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
  const [googlePending, setGooglePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmailNotice, setConfirmEmailNotice] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (mode === "forgot") {
      if (!email.trim()) return;
      setPending(true);
      setError(null);
      const supa = getSupabaseBrowser();
      const { error: err } = await supa.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
        }
      );
      if (err) {
        setError(err.message);
        setPending(false);
        return;
      }
      setResetEmailSent(true);
      setPending(false);
      return;
    }

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

  async function handleGoogleSignIn() {
    setGooglePending(true);
    setError(null);
    const supa = getSupabaseBrowser();
    const { error: err } = await supa.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (err) {
      setError(err.message);
      setGooglePending(false);
    }
    // On success the browser is redirected to Google — no further action needed.
  }

  function flipMode(to: Mode) {
    setMode(to);
    setError(null);
    setConfirmEmailNotice(false);
    setResetEmailSent(false);
    // Don't carry the 13+ tick across modes — flipping back to signup
    // should re-prompt for the affirmation.
    setConfirmedAdult(false);
  }

  const headings: Record<Mode, string> = {
    signin: "Sign in",
    signup: "Create account",
    forgot: "Reset password",
  };

  const subheadings: Record<Mode, string> = {
    signin: "Welcome back.",
    signup: "Pick a password and you're in.",
    forgot: "We'll email you a reset link.",
  };

  return (
    <div className="animate-rise-in mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-16">
      <div className="w-full rounded-2xl border border-cream-300 bg-cream-50 px-8 py-10 shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
        <h1 className="mb-1 text-center font-[family-name:var(--font-display)] text-3xl font-semibold text-ink-900">
          {headings[mode]}
        </h1>
        <p className="mb-6 text-center text-sm text-ink-500">
          {subheadings[mode]}
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
        ) : resetEmailSent ? (
          <div className="rounded-xl border border-cream-300 bg-cream-100 px-5 py-6 text-center">
            <p className="text-sm text-ink-700">
              Check your inbox at{" "}
              <span className="font-semibold text-ink-900">{email}</span> for a
              password reset link.
            </p>
          </div>
        ) : (
          <>
            {/* Google OAuth button — shown on sign-in and sign-up */}
            {mode !== "forgot" && (
              <>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={googlePending || pending}
                  className="flex w-full items-center justify-center gap-3 rounded-full border border-cream-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 shadow-sm transition-colors hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <GoogleIcon />
                  {googlePending
                    ? "Redirecting…"
                    : mode === "signin"
                      ? "Sign in with Google"
                      : "Sign up with Google"}
                </button>
                <div className="my-4 flex items-center gap-3">
                  <hr className="flex-1 border-cream-300" />
                  <span className="text-xs text-ink-400">or</span>
                  <hr className="flex-1 border-cream-300" />
                </div>
              </>
            )}

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
              {mode !== "forgot" && (
                <div className="space-y-1">
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
                  {mode === "signin" && (
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={() => flipMode("forgot")}
                        aria-label="Switch to password reset mode"
                        className="text-xs text-ink-400 hover:text-moss-700"
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}
                </div>
              )}
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
                  googlePending ||
                  !email.trim() ||
                  (mode !== "forgot" && !password) ||
                  (mode === "signup" && !confirmedAdult)
                }
                className="w-full rounded-full bg-moss-700 px-4 sm:px-6 lg:px-8 py-2.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending
                  ? mode === "signin"
                    ? "Signing in…"
                    : mode === "signup"
                      ? "Creating account…"
                      : "Sending…"
                  : mode === "signin"
                    ? "Sign in"
                    : mode === "signup"
                      ? "Create account"
                      : "Send reset link"}
              </button>
              {error && (
                <p className="text-center text-sm font-medium text-rose-600">
                  {error}
                </p>
              )}
            </form>
          </>
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
          ) : mode === "signup" ? (
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
          ) : (
            <button
              type="button"
              onClick={() => flipMode("signin")}
              className="font-medium text-moss-700 hover:text-ink-900"
            >
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Inline SVG for the Google "G" logo so there's no extra network request.
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 6.294C4.672 4.169 6.656 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}
