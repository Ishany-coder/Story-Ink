// Server component navbar. Reads the user's session server-side so we
// can render the right CTA (Sign in vs the user's email + Sign out)
// without a flash, then hands off to the client-side tabs component
// which uses usePathname() for active highlighting.

import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase-server";
import NavTabs from "./NavTabs";

export default async function Navbar() {
  const user = await getCurrentUser();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-stone-200 bg-[#faf8f3]/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-slate-900 hover:text-slate-700"
        >
          <span className="text-purple-600">Story</span>
          <span className="text-pink-600">Ink</span>
        </Link>

        <div className="flex items-center gap-3">
          {user ? <NavTabs /> : null}

          {user ? (
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="hidden items-center gap-2 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-stone-400 hover:bg-stone-50 sm:flex"
                title={user.email ?? "Signed in"}
              >
                <span className="hidden md:inline text-slate-500">
                  {user.email}
                </span>
                <span className="hidden md:inline text-stone-300">·</span>
                <span>Sign out</span>
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-[filter] hover:brightness-110"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
