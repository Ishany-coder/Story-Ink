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
    <nav className="fixed top-0 left-0 right-0 z-50 border-b-4 border-yellow-300 bg-white/90 backdrop-blur-md shadow-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight"
        >
          <span className="text-purple-500">Story</span>
          <span className="text-pink-500">Ink</span>
          <span className="ml-1 inline-block animate-wiggle text-2xl">
            &#9997;&#65039;
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {user ? <NavTabs /> : null}

          {user ? (
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="hidden items-center gap-2 rounded-full border-2 border-purple-200 bg-white px-3 py-1.5 text-xs font-black uppercase tracking-wider text-purple-500 hover:border-purple-400 hover:bg-purple-50 sm:flex"
                title={user.email ?? "Signed in"}
              >
                <span className="hidden md:inline">{user.email}</span>
                <span className="md:hidden">Sign out</span>
                <span className="hidden md:inline text-purple-300">·</span>
                <span className="hidden md:inline">Sign out</span>
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-gradient-to-r from-purple-400 to-pink-400 px-4 py-1.5 text-sm font-black text-white shadow-md shadow-purple-200 transition-all hover:scale-105"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
