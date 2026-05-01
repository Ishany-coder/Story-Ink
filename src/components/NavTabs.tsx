"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Tab strip in the navbar. Pulled out as a client component so the
// parent navbar can stay a server component (and read user session
// without a re-render).
//
// The "+ New story" CTA lives outside this strip — see Navbar.tsx.
// These tabs are pure browse/destination links.

interface Tab {
  label: string;
  href: string;
  matches: (p: string) => boolean;
  adminOnly?: boolean;
}

const TABS: Tab[] = [
  { label: "Home", href: "/", matches: (p) => p === "/" },
  { label: "Pets", href: "/pets", matches: (p) => p.startsWith("/pets") },
  { label: "Read", href: "/read", matches: (p) => p.startsWith("/read") },
  {
    label: "Studio",
    href: "/canvas",
    matches: (p) => p.startsWith("/canvas"),
  },
  { label: "Ship", href: "/ship", matches: (p) => p.startsWith("/ship") },
  {
    label: "Orders",
    href: "/orders",
    matches: (p) => p.startsWith("/orders"),
    adminOnly: true,
  },
];

export default function NavTabs({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const visible = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="hidden items-center gap-1 sm:flex">
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
