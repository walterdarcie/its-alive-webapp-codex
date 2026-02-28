import { extractViewerProfile, requireServerUser } from "@/lib/auth";
import { SearchPageClient } from "@/app/ui/search-page-client";

export default async function SearchPage() {
  const user = await requireServerUser();
  return <SearchPageClient viewer={extractViewerProfile(user)} />;
}
