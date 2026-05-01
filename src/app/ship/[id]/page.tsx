import { notFound, redirect } from "next/navigation";
import { getCurrentUser, getSupabaseServer } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import ShipStoryPage from "@/components/ShipStoryPage";
import type { Story } from "@/lib/types";

export const revalidate = 0;

export default async function ShipStory({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=/ship/${id}`);
  }
  const supa = await getSupabaseServer();
  const { data: story, error } = await supa
    .from("stories")
    .select("*")
    .eq("id", id)
    .single<Story>();
  if (error || !story) notFound();
  if ((story as Story & { user_id?: string | null }).user_id !== user.id) {
    notFound();
  }

  return (
    <ShipStoryPage
      story={story}
      isAdmin={isAdminUser(user)}
      bypassStripe={process.env.BYPASS_STRIPE === "1"}
    />
  );
}
