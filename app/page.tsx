import { extractViewerProfile, requireServerUser } from "@/lib/auth";
import { HomeClient } from "@/app/ui/home-client";

export default async function HomePage() {
  const user = await requireServerUser();
  return <HomeClient viewer={extractViewerProfile(user)} />;
}
