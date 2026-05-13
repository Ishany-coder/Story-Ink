import { isBetaTesting } from "@/lib/beta-flag";

// Small unobtrusive banner shown at the top of every page when the
// BETA_TESTING / NEXT_PUBLIC_BETA_TESTING env flag is on. Renders
// nothing in production. Sits in the document above the main content
// (the navbar is fixed and has its own z-index, so this slot lives
// directly in <main>'s flow).

export default function BetaBanner() {
  if (!isBetaTesting()) return null;
  return (
    <div className="border-b border-moss-200 bg-moss-100 px-4 py-2 text-center text-[12px] font-medium text-moss-700 sm:px-6 lg:px-8">
      Closed beta — hardcover orders are paused while we test.
    </div>
  );
}
