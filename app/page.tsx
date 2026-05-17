import { extractViewerProfile, requireServerUser } from "@/lib/auth";
import { HomeClient } from "@/app/ui/home-client";

export default async function HomePage({
  searchParams
}: {
  searchParams?: { tab?: string };
}) {
  const user = await requireServerUser();
  const initialTab = searchParams?.tab === "meus-shows" ? "meus-shows" : "novidades";
  return <HomeClient viewer={extractViewerProfile(user)} initialTab={initialTab} />;
}
