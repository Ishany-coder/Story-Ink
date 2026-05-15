import { redirect } from "next/navigation";
import StoryGeneratingScreen from "@/components/StoryGeneratingScreen";
import { getCurrentUser } from "@/lib/supabase-server";

export const revalidate = 0;

export default async function CreateGeneratingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/create");
  }

  const sp = await searchParams;
  const jobId = typeof sp.jobId === "string" ? sp.jobId : null;
  if (!jobId) {
    redirect("/create");
  }

  return <StoryGeneratingScreen jobId={jobId} />;
}
