"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import type { NavFlags } from "@/lib/nav-flags";
import { isBetaTesting } from "@/lib/beta-flag";

// Mobile-only nav (<md). Renders a hamburger button on the right of
// the navbar; tapping it opens a slide-down sheet with the same set
// of destinations as <NavTabs> plus the email + sign-out form and
// the "New story" CTA.
//
// On md+ this component renders nothing — desktop nav uses <NavTabs>
// + the inline sign-out form in Navbar.tsx.

interface Tab {
  label: string;
  href: string;
  matches: (p: string) => boolean;
  adminOnly?: boolean;
  flag: keyof NavFlags;
}

const TABS: Tab[] = [
  { label: "Home", href: "/", matches: (p) => p === "/", flag: "home" },
  {
    label: "Pets",
    href: "/pets",
    matches: (p) => p.startsWith("/pets"),
    flag: "pets",
  },
  {
    label: "Read",
    href: "/read",
    matches: (p) => p.startsWith("/read"),
    flag: "read",
  },
  {
    label: "Studio",
    href: "/canvas",
    matches: (p) => p.startsWith("/canvas"),
    flag: "studio",
  },
  {
    label: "Ship",
    href: "/ship",
    matches: (p) => p.startsWith("/ship"),
    flag: "ship",
  },
  {
    label: "My orders",
    href: "/my-orders",
    matches: (p) => p.startsWith("/my-orders"),
    flag: "myOrders",
  },
  {
    label: "Orders",
    href: "/orders",
    matches: (p) => p === "/orders" || p.startsWith("/orders/"),
    adminOnly: true,
    flag: "orders",
  },
  {
    label: "Stats",
    href: "/admin/stats",
    matches: (p) => p.startsWith("/admin/stats"),
    adminOnly: true,
    flag: "stats",
  },
  {
    label: "Support",
    href: "/admin/support",
    matches: (p) => p.startsWith("/admin/support"),
    adminOnly: true,
    flag: "support",
  },
];

export default function MobileMenu({
  isAdmin,
  flags,
  email,
}: {
  isAdmin: boolean;
  flags: NavFlags;
  email: string | null;
}) {
  const pathname = usePathname();
  // openedAtPath is null when the sheet is closed; otherwise it
  // records the path the sheet was opened on. If pathname later
  // diverges (user navigated via a tap), the sheet is treated as
  // closed without a setState-in-effect.
  const [openedAtPath, setOpenedAtPath] = useState<string | null>(null);
  const betaOn = isBetaTesting();

  const effectiveOpen = openedAtPath !== null && openedAtPath === pathname;

  function setOpen(next: boolean | ((v: boolean) => boolean)) {
    const willOpen =
      typeof next === "function" ? next(effectiveOpen) : next;
    setOpenedAtPath(willOpen ? pathname : null);
  }

  // Prevent body scroll while the sheet is open.
  useEffect(() => {
    if (!effectiveOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [effectiveOpen]);

  const visible = TABS.filter((t) => {
    if (t.adminOnly && !isAdmin) return false;
    if (isAdmin && !flags[t.flag]) return false;
    if (betaOn && t.flag === "ship") return false;
    return true;
  });

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={effectiveOpen}
        aria-controls="mobile-nav-panel"
        aria-label={effectiveOpen ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-cream-300 bg-cream-50 text-ink-700 transition-colors hover:bg-cream-200"
      >
        {effectiveOpen ? (
          <X size={18} aria-hidden="true" />
        ) : (
          <Menu size={18} aria-hidden="true" />
        )}
      </button>

      {effectiveOpen ? (
        <>
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 top-16 z-40 bg-ink-900/30 backdrop-blur-sm"
          />
          {/* Sheet */}
          <nav
            id="mobile-nav-panel"
            aria-label="Mobile navigation"
            className="fixed left-0 right-0 top-16 z-50 max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-cream-300 bg-cream-100 px-4 py-4 shadow-lg"
          >
            <div className="mx-auto flex max-w-6xl flex-col gap-2">
              {visible.map((tab) => {
                const active = tab.matches(pathname);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`rounded-2xl px-4 py-3 text-base font-medium transition-colors ${
                      active
                        ? "bg-ink-900 text-cream-50"
                        : "bg-cream-50 text-ink-700 hover:bg-cream-200"
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}

              <Link
                href="/create"
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-moss-700 px-4 py-3 text-base font-semibold text-cream-50 shadow-sm transition-colors hover:bg-moss-900"
              >
                + New story
              </Link>

              <form action="/auth/signout" method="post" className="mt-2">
                <button
                  type="submit"
                  className="flex w-full items-center justify-between rounded-2xl border border-cream-300 bg-cream-50 px-4 py-3 text-sm text-ink-500 transition-colors hover:bg-cream-200"
                >
                  <span className="truncate pr-3 text-ink-700">
                    {email ?? "Signed in"}
                  </span>
                  <span className="shrink-0 font-medium">Sign out</span>
                </button>
              </form>
            </div>
          </nav>
        </>
      ) : null}
    </div>
  );
}
