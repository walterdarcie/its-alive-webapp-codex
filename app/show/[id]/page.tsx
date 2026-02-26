import { ShowDetailClient } from "@/app/ui/show-detail-client";

export default function ShowDetailPage({ params }: { params: { id: string } }) {
  return <ShowDetailClient id={params.id} />;
}

