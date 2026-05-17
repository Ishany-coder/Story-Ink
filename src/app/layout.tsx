import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Nunito, Playfair_Display } from "next/font/google";
import Navbar from "@/components/Navbar";
import BetaBanner from "@/components/BetaBanner";
import SentryInit from "@/components/SentryInit";
import CookieConsent from "@/components/CookieConsent";
import CookieSettingsLink from "@/components/CookieSettingsLink";
import "./globals.css";

// Nunito stays for body — friendly enough for the kid-facing reading
// surfaces (Read mode), readable enough for grieving copy. Display
// face is Playfair Display, the standard premium-editorial serif —
// classic letterforms (clean f and j with no quirky stylistic-set
// alternates), used by Vogue / NYT-style mastheads, instantly reads
// "fine print" without surprising the reader.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

// Centralised site descriptors so the same strings populate <title>,
// description, Open Graph, and Twitter cards without drift. Favicon
// (`icon.png`), Apple touch icon (`apple-icon.png`), and the dynamic
// Open Graph image (`opengraph-image.tsx`) are picked up automatically
// from the app/ directory via Next.js file-based metadata conventions.
const SITE_NAME = "StoryInk";
const SITE_TITLE = "StoryInk — The fine art of pet storytelling";
const SITE_DESCRIPTION =
  "Hand-illustrated keepsake storybooks starring your pet. Living adventures and Rainbow Bridge memorials, printed as museum-grade hardcovers.";
const SITE_BASE_URL = (
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://storyink.ai"
).replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_BASE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_BASE_URL,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${playfair.variable} h-full`}
    >
      <head>
        {/* Google Fonts preconnect kept site-wide so the Studio /
            Reader stylesheet (loaded only on those routes — see
            src/lib/fonts.ts) starts its TLS handshake as soon as a
            user clicks into one of them. The stylesheet itself is
            ~1.4KB but render-blocking, so we used to load it on
            every page; only Studio + Reader actually render with the
            picker fonts, so the marketing + signup + dashboard surfaces
            no longer pay that cost. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-full bg-cream-100 font-[family-name:var(--font-nunito)] text-ink-700 antialiased">
        <SentryInit />
        <Navbar />
        <main className="pt-16">
          <BetaBanner />
          {children}
        </main>
        <footer className="border-t border-cream-300 bg-cream-50 px-4 py-6 text-xs text-ink-500 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-4">
            {/* Popular posts. Sitewide internal-link surface — every
                non-blog page becomes a tiny inbound link to the three
                highest-value posts. Kept compact (no heading,
                middle-dot separator) so it reads as a footer aside,
                not a navigation block. */}
            <nav
              aria-label="Popular posts"
              className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] uppercase tracking-[0.18em] text-ink-300"
            >
              <span className="text-ink-300">Popular posts</span>
              <Link
                href="/blog/memorializing-a-pet"
                className="text-ink-500 hover:text-moss-700"
              >
                Pet memorial book guide
              </Link>
              <span aria-hidden="true">&middot;</span>
              <Link
                href="/blog/how-to-write-a-great-prompt"
                className="text-ink-500 hover:text-moss-700"
              >
                Writing prompts
              </Link>
              <span aria-hidden="true">&middot;</span>
              <Link
                href="/blog/science-of-pet-reference-photos"
                className="text-ink-500 hover:text-moss-700"
              >
                Reference photo guide
              </Link>
            </nav>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              <Link
                href="/"
                aria-label="StoryInk home"
                className="flex items-center gap-1.5 font-[family-name:var(--font-display)] text-sm font-semibold text-ink-700 transition-colors hover:text-moss-700"
              >
                <Image
                  src="/logo.png"
                  alt=""
                  width={20}
                  height={20}
                  className="h-5 w-5 shrink-0 object-contain"
                />
                <span>
                  <span>Story</span>
                  <span className="text-moss-700">Ink</span>
                </span>
              </Link>
              <span>&copy; {new Date().getFullYear()}</span>
              <Link href="/blog" className="hover:text-moss-700">
                Blog
              </Link>
              <Link href="/privacy" className="hover:text-moss-700">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-moss-700">
                Terms
              </Link>
              <Link href="/help" className="hover:text-moss-700">
                Help
              </Link>
              <CookieSettingsLink />
            </div>
          </div>
        </footer>
        <CookieConsent />
      </body>
    </html>
  );
}
