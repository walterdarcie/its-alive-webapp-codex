import type { Metadata } from "next";
import { ShowDetailClient } from "@/app/ui/show-detail-client";
import { getSetlistById } from "@/lib/setlist-api";
import { getCacheValue, setCacheValue } from "@/lib/setlist-cache";
import { formatDatePtBrLong, formatVenueLine } from "@/lib/show-utils";
import type { ShowDetailRecord } from "@/lib/show-types";
import { getServerUser } from "@/lib/auth";

const DETAIL_TTL_WITH_SETLIST_MS = 1000 * 60 * 60 * 24;
const DETAIL_TTL_EMPTY_SETLIST_MS = 1000 * 60 * 5;
const SITE_URL = "https://itsalivememories.vercel.app";

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
      description: "Detalhes do show não disponíveis.",
      robots: { index: false, follow: false }
    };
  }

  const date = formatDatePtBrLong(show.eventDateIso);
  const venue = formatVenueLine(show);
  const title = `${show.artist} em ${venue} – ${date} | it's alive`;
  const description = show.songNames.length > 0
    ? `Setlist e detalhes de ${show.artist} em ${venue}, ${date}. ${show.songNames.length} músicas tocadas.`
    : `Detalhes do show de ${show.artist} em ${venue}, ${date}. Veja informações do evento.`;
  const pageUrl = `${SITE_URL}/show/${params.id}`;

  return {
    title,
    description,
    alternates: {
      canonical: pageUrl
    },
    robots: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large" as const
    },
    openGraph: {
      title,
      description,
      type: "website",
      locale: "pt_BR",
      url: pageUrl,
      siteName: "it's alive",
      ...(show.artistImageUrl
        ? { images: [{ url: show.artistImageUrl, width: 800, height: 800, alt: `${show.artist} ao vivo` }] }
        : {})
    },
    twitter: {
      card: "summary_large_image",
      title: `${show.artist} – ${venue}`,
      description
    }
  };
}

function buildEventJsonLd(show: ShowDetailRecord, pageUrl: string) {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: `${show.artist} ao vivo`,
    startDate: show.eventDateIso,
    url: pageUrl,
    performer: {
      "@type": "MusicGroup",
      name: show.artist
    },
    location: {
      "@type": "Place",
      name: show.venue,
      address: {
        "@type": "PostalAddress",
        addressLocality: show.city,
        addressCountry: show.country
      }
    }
  };

  if (show.artistImageUrl) {
    jsonLd.image = show.artistImageUrl;
  }

  if (show.tourName) {
    jsonLd.description = `Turnê: ${show.tourName}`;
  }

  return jsonLd;
}

export default async function ShowDetailPage({ params }: { params: { id: string } }) {
  const [show, user] = await Promise.all([fetchShowData(params.id), getServerUser()]);
  const isAuthenticated = !!user;
  const pageUrl = `${SITE_URL}/show/${params.id}`;

  return (
    <>
      {show ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildEventJsonLd(show, pageUrl)) }}
        />
      ) : null}
      <ShowDetailClient id={params.id} initialData={show} isAuthenticated={isAuthenticated} />
    </>
  );
}
