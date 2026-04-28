import type { Metadata } from "next";
import { Nunito, Fredoka } from "next/font/google";
import Navbar from "@/components/Navbar";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StoryInk — Storybooks about your pet",
  description:
    "Upload a few photos of your pet and turn them into the hero of an illustrated storybook. Living adventures or memorial keepsakes, printed and shipped.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${nunito.variable} ${fredoka.variable} h-full`}>
      <body className="min-h-full bg-[#faf8f3] font-[family-name:var(--font-nunito)] text-slate-800 antialiased">
        <Navbar />
        <main className="pt-16">{children}</main>
      </body>
    </html>
  );
}
