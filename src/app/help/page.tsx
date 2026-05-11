import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase-server";
import HelpChat from "@/components/HelpChat";

export const revalidate = 0;
export const dynamic = "force-dynamic";

// Dedicated full-page help chat at /help. Signed-in only —
// anonymous visitors get bounced to /login with a return URL back
// to /help so they don't lose the navigation.

export default async function HelpPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/help");
  return <HelpChat />;
}
