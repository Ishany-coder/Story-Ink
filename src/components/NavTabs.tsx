"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The tab strip in the navbar. Pulled out to its own client component
// so the parent navbar can stay a server component (and read the user
// session without a re-render).

const TABS: { label: string; href: string; matches: (p: string) => boolean }[] =
  [
    { label: "Home", href: "/", matches: (p) => p === "/" },
    { label: "Pets", href: "/pets", matches: (p) => p.startsWith("/pets") },
    { label: "Read", href: "/read", matches: (p) => p.startsWith("/read") },
    {
      label: "Studio",
      href: "/canvas",
      matches: (p) => p.startsWith("/canvas"),
    },
    { label: "Ship", href: "/ship", matches: (p) => p.startsWith("/ship") },
  ];

export default function NavTabs() {
  const pathname = usePathname();

  return (
    <div className="hidden items-center gap-1 sm:flex">
      {TABS.map((tab) => {
        const active = tab.matches(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-stone-200/70 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
