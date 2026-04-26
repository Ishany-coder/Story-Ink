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
    {
      label: "Listen",
      href: "/listen",
      matches: (p) => p.startsWith("/listen"),
    },
    { label: "Ship", href: "/ship", matches: (p) => p.startsWith("/ship") },
  ];

export default function NavTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1.5">
      {TABS.map((tab) => {
        const active = tab.matches(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full px-3 py-2 text-xs font-bold transition-all sm:text-sm sm:px-4 ${
              active
                ? "bg-gradient-to-r from-purple-400 to-pink-400 text-white shadow-md shadow-purple-200"
                : "bg-purple-50 text-purple-400 hover:bg-purple-100 hover:text-purple-600"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
