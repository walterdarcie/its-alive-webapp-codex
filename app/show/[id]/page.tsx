import type { Metadata } from "next";
import { ShowDetailClient } from "@/app/ui/show-detail-client";
import { getSetlistById } from "@/lib/setlist-api";
import { getCacheValue, setCacheValue } from "@/lib/setlist-cache";
import { formatDatePtBrLong, formatVenueLine } from "@/lib/show-utils";
import type { ShowDetailRecord } from "@/lib/show-types";
import { getServerUser } from "@/lib/auth";

const DETAIL_TTL_WITH_SETLIST_MS = 1000 * 60 * 60 * 24;
const DETAIL_TTL_EMPTY_SETLIST_MS = 1000 * 60 * 5;

async function fetchShowData(id: string): Promise<ShowDetailRecord | null> {
  const cacheKey = `detail:${id}`;
  const cached = getCacheValue<ShowDetailRecord>(cacheKey);
  if (cached) return cached;

  try {
    const payload = await getSetlistById(id);
    const ttlMs = payload.songNames.length > 0 ? DETAIL_TTL_WITH_SETLIST_MS : DETAIL_TTL_EMPTY_SETLIST_MS;
    setCacheValue(cacheKey, payload, ttlMs);
    return payload;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const show = await fetchShowData(params.id);

  if (!show) {
    return {
      title: "Show não encontrado | it's alive",
      description: "Detalhes do show não disponíveis."
    };
  }

  const date = formatDatePtBrLong(show.eventDateIso);
  const venue = formatVenueLine(show);
  const title = `${show.artist} – ${venue} | it's alive`;
  const description = `${show.artist} em ${venue}, ${date}. Veja o setlist e detalhes do show.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `https://itsalivememories.vercel.app/show/${params.id}`,
      siteName: "it's alive",
      ...(show.artistImageUrl
        ? { images: [{ url: show.artistImageUrl, width: 800, height: 800, alt: show.artist }] }
        : {})
    },
    twitter: {
      card: "summary_large_image",
      title: `${show.artist} – ${venue}`,
      description
    }
  };
}

export default async function ShowDetailPage({ params }: { params: { id: string } }) {
  const [show, user] = await Promise.all([fetchShowData(params.id), getServerUser()]);
  const isAuthenticated = !!user;

  return <ShowDetailClient id={params.id} initialData={show} isAuthenticated={isAuthenticated} />;
}
