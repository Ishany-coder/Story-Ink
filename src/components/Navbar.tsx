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
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-cream-300 bg-cream-100/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-ink-900 transition-colors hover:text-ink-700"
        >
          <span>Story</span>
          <span className="text-moss-700">Ink</span>
        </Link>

        <div className="flex items-center gap-4">
          {user ? <NavTabs /> : null}

          {user ? (
            <div className="flex items-center gap-3">
              <Link
                href="/create"
                className="hidden items-center gap-1.5 rounded-full bg-moss-700 px-4 py-1.5 text-sm font-semibold text-cream-50 shadow-sm transition-all hover:bg-moss-900 sm:inline-flex"
              >
                <PlusIcon />
                New story
              </Link>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="hidden items-center gap-2 rounded-full border border-cream-300 bg-cream-50 px-3 py-1.5 text-xs font-medium text-ink-500 transition-colors hover:border-cream-400 hover:bg-cream-200 md:flex"
                  title={user.email ?? "Signed in"}
                >
                  <span className="hidden text-ink-300 lg:inline">
                    {user.email}
                  </span>
                  <span className="hidden text-cream-400 lg:inline">·</span>
                  <span>Sign out</span>
                </button>
              </form>
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-moss-700 px-4 py-1.5 text-sm font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M7 1.5v11M1.5 7h11" />
    </svg>
  );
}
