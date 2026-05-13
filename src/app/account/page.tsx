import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import AccountActions from "./AccountActions";

export const metadata = {
  title: "Account — StoryInk",
  description: "Export or delete your StoryInk account data.",
};

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/account");
  }

  return (
    <article className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-12 text-ink-700">
      <Link
        href="/"
        className="text-sm font-medium text-ink-300 hover:text-moss-700"
      >
        &larr; Back home
      </Link>

      <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
        Account
      </h1>
      <p className="mt-2 text-sm text-ink-500">
        Signed in as <span className="font-medium text-ink-700">{user.email}</span>.
      </p>

      <section className="mt-8 rounded-2xl border border-cream-300 bg-cream-50 p-6">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
          Your data
        </h2>
        <p className="mt-2 text-sm">
          Download a JSON copy of everything we have on file for you, or
          permanently delete your account.
        </p>

        <AccountActions />
      </section>
    </article>
  );
}
