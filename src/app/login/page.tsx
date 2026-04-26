"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

// Magic-link login. The user enters their email, Supabase sends them
// a one-time link, clicking it routes through /auth/callback which
// exchanges the auth code for a cookie session and redirects home.
//
// Why magic link: zero passwords to remember, single email-input UX,
// works without any extra Supabase Auth provider config. We can layer
// email + password or social providers in later commits without
// touching this page meaningfully.

export default function LoginPage() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setPending(true);
    setError(null);

    const supa = getSupabaseBrowser();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      next
    )}`;

    const { error: err } = await supa.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });

    if (err) {
      setError(err.message);
      setPending(false);
    } else {
      setSent(true);
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col items-center justify-center px-6 py-16">
      <div className="w-full rounded-3xl bg-gradient-to-r from-purple-400 via-pink-400 to-orange-300 p-[3px] shadow-xl shadow-purple-200/50">
        <div className="rounded-3xl bg-white px-8 py-10">
          <h1 className="mb-2 text-center font-[family-name:var(--font-display)] text-3xl font-bold text-purple-700">
            Sign in
          </h1>
          <p className="mb-6 text-center text-sm font-bold text-purple-400">
            We&rsquo;ll email you a magic link.
          </p>

          {sent ? (
            <div className="rounded-2xl border-2 border-purple-200 bg-purple-50 px-5 py-6 text-center">
              <div className="mb-2 text-3xl">&#128231;</div>
              <p className="text-sm font-bold text-purple-700">
                Check your inbox at <span className="font-black">{email}</span>.
              </p>
              <p className="mt-2 text-xs font-bold text-purple-400">
                Click the link to finish signing in.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-2xl border-2 border-purple-200 bg-white px-5 py-3 text-base text-purple-900 placeholder-purple-300 focus:border-purple-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={pending || !email.trim()}
                className="w-full rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-6 py-3 text-base font-black text-white shadow-md shadow-purple-200 transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
              >
                {pending ? "Sending..." : "Send magic link"}
              </button>
              {error && (
                <p className="text-center text-sm font-bold text-rose-500">
                  {error}
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
