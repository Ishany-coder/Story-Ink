import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ShipStoryPage from "@/components/ShipStoryPage";
import type { Story } from "@/lib/types";

export const revalidate = 0;

export default async function ShipStory({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: story, error } = await supabase
    .from("stories")
    .select("*")
    .eq("id", id)
    .single<Story>();
  if (error || !story) notFound();

  return <ShipStoryPage story={story} />;
}
