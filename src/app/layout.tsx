import type { Metadata } from "next";
import { Nunito, Fraunces } from "next/font/google";
import Navbar from "@/components/Navbar";
import "./globals.css";

// Nunito stays for body — friendly enough for the kid-facing reading
// surfaces (Read mode), readable enough for grieving copy. Fraunces
// is the new display face: a variable optical-size editorial serif
// that gives the brand an "art book / fine-print" feel rather than
// "kids' app." Optical sizing axis (opsz) is enabled so titles set
// at 56px don't look like body text scaled up.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "StoryInk — The fine art of pet storytelling",
  description:
    "Hand-illustrated keepsake storybooks starring your pet. Living adventures and Rainbow Bridge memorials, printed as museum-grade hardcovers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${fraunces.variable} h-full`}
    >
      <body className="min-h-full bg-cream-100 font-[family-name:var(--font-nunito)] text-ink-700 antialiased">
        <Navbar />
        <main className="pt-16">{children}</main>
      </body>
    </html>
  );
}
