"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavFlags } from "@/lib/nav-flags";
import { isBetaTesting } from "@/lib/beta-flag";

// Tab strip in the navbar. Pulled out as a client component so the
// parent navbar can stay a server component (and read user session
// without a re-render).
//
// The "+ New story" CTA lives outside this strip — see Navbar.tsx.
// These tabs are pure browse/destination links.
//
// Per-tab visibility for the admin only is controlled server-side
// via the SHOW_* environment variables (see src/lib/nav-flags.ts).
// Setting SHOW_SHIP=false in .env hides Ship from the admin's
// navbar; regular users always see every non-admin-only tab
// regardless of the flag values. Default for unset env vars is
// visible.

interface Tab {
  label: string;
  href: string;
  matches: (p: string) => boolean;
  adminOnly?: boolean;
  // Key into the NavFlags map. When the flag is false, the tab is
  // hidden regardless of admin status.
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
    label: "Blog",
    href: "/blog",
    matches: (p) => p.startsWith("/blog"),
    flag: "blog",
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

export default function NavTabs({
  isAdmin = false,
  flags,
}: {
  isAdmin?: boolean;
  flags: NavFlags;
}) {
  const pathname = usePathname();
  const betaOn = isBetaTesting();
  // Admin-only tabs are gated on isAdmin first. The SHOW_* flags
  // then apply to the admin's view *only* — regular users see every
  // non-admin-only tab regardless of how the env vars are set.
  // The closed-beta flag additionally hides the "Ship" tab for
  // everyone (the /ship route 404s when the flag is on).
  const visible = TABS.filter((t) => {
    if (t.adminOnly && !isAdmin) return false;
    if (isAdmin && !flags[t.flag]) return false;
    if (betaOn && t.flag === "ship") return false;
    return true;
  });

  return (
    <div className="hidden items-center gap-1 md:flex">
      {visible.map((tab) => {
        const active = tab.matches(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-ink-900 text-cream-50"
                : "text-ink-500 hover:bg-cream-200 hover:text-ink-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
