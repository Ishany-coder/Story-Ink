"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import Link from "next/link";

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

// Value props shown in the brand panel (desktop) and mobile header.
const VALUE_PROPS = [
  {
    id: "personalized",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 16c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    text: "Personalized to your pet's look and personality",
  },
  {
    id: "hardcover",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="2" y="3" width="11" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M13 5h2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M5 7h6M5 10h6M5 13h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
    text: "Museum-grade hardcover — a real keepsake to hold",
  },
  {
    id: "memorial",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M9 2L10.8 6.5H16L11.6 9.5L13.4 14L9 11L4.6 14L6.4 9.5L2 6.5H7.2L9 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
    text: "Memorial mode for Rainbow Bridge tributes",
  },
];

// Decorative stacked-books illustration drawn in SVG using brand colors.
// Fill values mirror the design tokens in globals.css (@theme inline).
function BookStackIllustration() {
  return (
    <svg
      viewBox="0 0 200 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="w-full max-w-[240px]"
    >
      {/* Bottom book — largest, tilted slightly left */}
      <g transform="rotate(-8, 100, 120)">
        <rect x="30" y="110" width="140" height="24" rx="3" style={{ fill: "var(--color-moss-700)" }} />
        <rect x="30" y="110" width="12" height="24" rx="2" style={{ fill: "var(--color-moss-900)" }} />
        <rect x="34" y="114" width="4" height="16" rx="1" style={{ fill: "var(--color-gold-500)" }} />
      </g>
      {/* Middle book */}
      <g transform="rotate(3, 100, 95)">
        <rect x="38" y="88" width="124" height="22" rx="3" style={{ fill: "var(--color-moss-500)" }} />
        <rect x="38" y="88" width="11" height="22" rx="2" style={{ fill: "var(--color-moss-700)" }} />
        <rect x="42" y="92" width="3" height="14" rx="1" style={{ fill: "var(--color-gold-300)" }} />
      </g>
      {/* Top book — centered, upright */}
      <rect x="46" y="52" width="108" height="36" rx="4" style={{ fill: "var(--color-gold-500)" }} />
      <rect x="46" y="52" width="13" height="36" rx="3" style={{ fill: "var(--color-gold-700)" }} />
      <rect x="50" y="58" width="4" height="24" rx="1.5" style={{ fill: "var(--color-cream-50)" }} opacity="0.7" />
      {/* Book cover illustration — simple paw print */}
      <circle cx="105" cy="70" r="7" style={{ fill: "var(--color-cream-50)" }} opacity="0.25" />
      <circle cx="105" cy="70" r="4" style={{ fill: "var(--color-cream-50)" }} opacity="0.4" />
      <circle cx="99" cy="65" r="2" style={{ fill: "var(--color-cream-50)" }} opacity="0.4" />
      <circle cx="111" cy="65" r="2" style={{ fill: "var(--color-cream-50)" }} opacity="0.4" />
      <circle cx="105" cy="63" r="2" style={{ fill: "var(--color-cream-50)" }} opacity="0.4" />
      {/* Gold rule accent */}
      <line x1="60" y1="145" x2="140" y2="145" style={{ stroke: "var(--color-gold-500)" }} strokeWidth="1" strokeLinecap="round" />
      {/* Floating sparkle dots */}
      <circle cx="160" cy="48" r="2.5" style={{ fill: "var(--color-gold-500)" }} opacity="0.5" />
      <circle cx="40" cy="42" r="1.5" style={{ fill: "var(--color-gold-500)" }} opacity="0.35" />
      <circle cx="170" cy="100" r="1.5" style={{ fill: "var(--color-moss-300)" }} opacity="0.5" />
    </svg>
  );
}

// Brand / marketing panel — shown as the left column on desktop,
// and as a compact branded header on mobile.
function BrandPanel({ mobile = false }: { mobile?: boolean }) {
  if (mobile) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 pt-6 pb-4 text-center">
        {/* Brand wordmark */}
        <span className="font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.3em] text-moss-700">
          The fine art of pet storytelling
        </span>
        <span className="block h-px w-10 bg-gold-500" />
        <p className="font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight text-ink-900">
          Storybooks{" "}
          <em className="font-normal italic text-moss-700">starring your pet.</em>
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col justify-between overflow-hidden rounded-l-2xl bg-moss-900 px-10 py-12 text-cream-50">
      {/* Subtle texture overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, #fff 0px, #fff 1px, transparent 1px, transparent 10px)",
        }}
      />

      {/* Top: wordmark + tagline */}
      <div className="relative">
        <span className="font-[family-name:var(--font-display)] text-[10px] font-medium uppercase tracking-[0.35em] text-gold-300">
          The fine art of pet storytelling
        </span>
        <span className="mt-2 block h-px w-10 bg-gold-500" />
        <h2 className="mt-5 font-[family-name:var(--font-display)] text-3xl font-semibold leading-[1.1] tracking-tight text-cream-50 xl:text-4xl">
          Storybooks{" "}
          <em className="font-normal italic text-gold-300">starring your pet.</em>
        </h2>
        <p className="mt-4 max-w-xs text-sm leading-relaxed text-moss-300">
          Hand-illustrated keepsake books built from your photos — for
          living adventures and Rainbow Bridge memorials alike.
        </p>
      </div>

      {/* Middle: illustration */}
      <div className="relative my-8 flex justify-center">
        <BookStackIllustration />
      </div>

      {/* Bottom: value props */}
      <ul className="relative space-y-3">
        {VALUE_PROPS.map((vp) => (
          <li key={vp.id} className="flex items-start gap-3 text-sm text-moss-200">
            <span className="mt-0.5 shrink-0 text-gold-300">{vp.icon}</span>
            <span>{vp.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Terms & Privacy acceptance. Signup requires agreement to our Terms of
  // Service (which include the 13+ eligibility requirement) and Privacy
  // Policy. Reset every time the user flips into signup mode.
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmailNotice, setConfirmEmailNotice] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  // Set when Supabase rejects the OAuth call with "provider is not
  // enabled" so we hide the Google button for the rest of this session
  // — clicking again would just hit the same error. Real fix lives in
  // the Supabase dashboard (Authentication → Providers → Google).
  const [googleUnavailable, setGoogleUnavailable] = useState(false);

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
    if (mode === "signup" && !agreedToTerms) {
      setError("Please agree to the Terms of Service and Privacy Policy to create an account.");
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
      const msg = err.message.toLowerCase();
      // Supabase returns a generic "Unsupported provider: provider is
      // not enabled" string when Google OAuth isn't configured on the
      // project. Show a friendlier message and hide the button for the
      // rest of the session so the user falls back to email.
      if (
        msg.includes("provider is not enabled") ||
        msg.includes("unsupported provider")
      ) {
        setError(
          "Google sign-in isn't available yet — please use email below."
        );
        setGoogleUnavailable(true);
      } else {
        setError(err.message);
      }
      setGooglePending(false);
    }
    // On success the browser is redirected to Google — no further action needed.
  }

  function flipMode(to: Mode) {
    setMode(to);
    setError(null);
    setConfirmEmailNotice(false);
    setResetEmailSent(false);
    // Reset terms acceptance when flipping back to signup so the user
    // must re-affirm if they switch modes.
    setAgreedToTerms(false);
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
    // Full-height two-column layout on desktop; single column on mobile.
    <div className="animate-rise-in flex min-h-[calc(100vh-4rem)] items-stretch lg:items-center lg:justify-center lg:px-8 lg:py-12">
      <div className="w-full lg:grid lg:max-w-5xl lg:grid-cols-[1fr_1fr] lg:overflow-hidden lg:rounded-2xl lg:shadow-[0_16px_64px_rgba(0,0,0,0.1)]">

        {/* Brand panel — left column on desktop, compact header on mobile */}
        <div className="lg:hidden">
          <BrandPanel mobile />
        </div>
        <div className="hidden lg:block">
          <BrandPanel />
        </div>

        {/* Form panel */}
        <div className="flex flex-col justify-center bg-cream-50 px-6 py-10 sm:px-10 lg:px-12 lg:py-14">
          <h1 className="mb-1 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink-900">
            {headings[mode]}
          </h1>
          <p className="mb-7 text-sm text-ink-500">
            {subheadings[mode]}
          </p>

          {confirmEmailNotice ? (
            <div className="rounded-xl border border-cream-300 bg-cream-100 px-5 py-6">
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
            <div className="rounded-xl border border-cream-300 bg-cream-100 px-5 py-6">
              <p className="text-sm text-ink-700">
                Check your inbox at{" "}
                <span className="font-semibold text-ink-900">{email}</span> for a
                password reset link.
              </p>
            </div>
          ) : (
            <>
              {/* Google OAuth button — shown on sign-in and sign-up,
                  hidden once Supabase tells us the provider isn't
                  configured (see handleGoogleSignIn). */}
              {mode !== "forgot" && !googleUnavailable && (
                <>
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={googlePending || pending}
                    className="flex w-full items-center justify-center gap-3 rounded-full border border-cream-300 bg-cream-50 px-4 py-2.5 text-sm font-semibold text-ink-700 shadow-sm transition-colors hover:bg-cream-100 hover:border-cream-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-moss-700"
                    />
                    <span>
                      I agree to the{" "}
                      <Link
                        href="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-moss-700 underline hover:text-ink-900"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Terms of Service
                      </Link>{" "}
                      and{" "}
                      <Link
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-moss-700 underline hover:text-ink-900"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Privacy Policy
                      </Link>
                      .
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
                    (mode === "signup" && !agreedToTerms)
                  }
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-moss-700 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                  <p className="text-sm font-medium text-rose-600">{error}</p>
                )}
              </form>
            </>
          )}

          <div className="mt-6 text-sm text-ink-500">
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
