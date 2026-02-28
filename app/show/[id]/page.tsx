import { requireServerUser } from "@/lib/auth";
import { ShowDetailClient } from "@/app/ui/show-detail-client";

export default async function ShowDetailPage({ params }: { params: { id: string } }) {
  await requireServerUser();
  return <ShowDetailClient id={params.id} />;
}
