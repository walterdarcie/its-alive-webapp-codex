import type { ShowRecord } from "@/lib/show-types";
import { getCacheValue, setCacheValue } from "@/lib/setlist-cache";

const BASE_URL = "https://app.ticketmaster.com/discovery/v2";
const UPCOMING_TTL_MS = 1000 * 60 * 60; // 1h

type TicketmasterVenue = {
  name?: string;
  city?: { name?: string };
  state?: { name?: string; stateCode?: string };
  country?: { name?: string; countryCode?: string };
};

type TicketmasterAttraction = {
  name?: string;
  id?: string;
};

type TicketmasterEvent = {
  id?: string;
  name?: string;
  url?: string;
  dates?: {
    start?: { localDate?: string };
    status?: { code?: string };
  };
  _embedded?: {
    venues?: TicketmasterVenue[];
    attractions?: TicketmasterAttraction[];
  };
};

type TicketmasterResponse = {
  _embedded?: { events?: TicketmasterEvent[] };
};

function getApiKey() {
  return process.env.TICKETMASTER_API_KEY ?? "";
}

function eventToShowRecord(event: TicketmasterEvent, queryArtistName: string): ShowRecord | null {
  if (!event.id || !event.dates?.start?.localDate) return null;

  const dateIso = event.dates.start.localDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;

  const venue = event._embedded?.venues?.[0];
  const city = [venue?.city?.name, venue?.state?.stateCode ?? venue?.state?.name]
    .filter(Boolean)
    .join(", ");

  const artistName = event._embedded?.attractions?.[0]?.name ?? queryArtistName;
  const eventName = event.name ?? "";
  const tourName = eventName && eventName !== artistName ? eventName : undefined;

  // Only set ticketUrl when tickets are actively on sale
  const ticketUrl = event.dates?.status?.code === "onsale" ? event.url : undefined;

  return {
    id: `tm-${event.id}`,
    artist: artistName,
    venue: venue?.name ?? "",
    city,
    country: venue?.country?.name ?? "",
    eventDateIso: dateIso,
    ticketUrl,
    tourName
  };
}

export async function searchUpcomingByArtist(artistName: string): Promise<ShowRecord[]> {
  const trimmed = artistName.trim();
  if (!trimmed || trimmed.length < 2) return [];

  const apiKey = getApiKey();
  if (!apiKey) return [];

  const cacheKey = `tm:upcoming:${trimmed.toLowerCase()}`;
  const cached = getCacheValue<ShowRecord[]>(cacheKey);
  if (cached) return cached;

  const startDateTime = `${new Date().toISOString().split(".")[0]}Z`;

  const params = new URLSearchParams({
    apikey: apiKey,
    keyword: trimmed,
    classificationName: "music",
    sort: "date,asc",
    size: "20",
    startDateTime
  });

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/events.json?${params.toString()}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 * 60 }
    });
  } catch {
    return [];
  }

  if (!response.ok) return [];

  let data: TicketmasterResponse;
  try {
    data = (await response.json()) as TicketmasterResponse;
  } catch {
    return [];
  }

  const shows = (data._embedded?.events ?? [])
    .map((event) => eventToShowRecord(event, trimmed))
    .filter((s): s is ShowRecord => s !== null);

  setCacheValue(cacheKey, shows, UPCOMING_TTL_MS);
  return shows;
}
