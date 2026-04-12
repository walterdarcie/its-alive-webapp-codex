import { extractViewerProfile, getServerUser } from "@/lib/auth";
import { SearchPageClient } from "@/app/ui/search-page-client";

export default async function SearchPage({
  searchParams
}: {
  searchParams?: { q?: string };
}) {
  const user = await getServerUser();
  const viewer = user ? extractViewerProfile(user) : null;
  const isAuthenticated = !!user;
  const initialQuery = typeof searchParams?.q === "string" ? searchParams.q : undefined;

  return <SearchPageClient viewer={viewer} isAuthenticated={isAuthenticated} initialQuery={initialQuery} />;
}
