import { extractViewerProfile, getServerUser } from "@/lib/auth";
import { SearchPageClient, type SearchTab } from "@/app/ui/search-page-client";

export default async function SearchPage({
  searchParams
}: {
  searchParams?: { q?: string; tab?: string };
}) {
  const user = await getServerUser();
  const viewer = user ? extractViewerProfile(user) : null;
  const isAuthenticated = !!user;
  const initialQuery = typeof searchParams?.q === "string" ? searchParams.q : undefined;
  const initialTab: SearchTab = searchParams?.tab === "amigos" ? "amigos" : "shows";

  return (
    <SearchPageClient
      viewer={viewer}
      isAuthenticated={isAuthenticated}
      initialQuery={initialQuery}
      initialTab={initialTab}
    />
  );
}
