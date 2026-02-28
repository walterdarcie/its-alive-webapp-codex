import { requireServerUser } from "@/lib/auth";
import { SearchPageClient } from "@/app/ui/search-page-client";

export default async function SearchPage() {
  await requireServerUser();
  return <SearchPageClient />;
}
