import type { ShowRecord } from "@/lib/show-types";
import { getCacheValue, setCacheValue } from "@/lib/setlist-cache";

const BASE_URL = "https://api.data.jambase.com";
// Conservative TTLs to protect free-tier quota (1,000 calls/month)
const UPCOMING_TTL_MS = 4 * 60 * 60 * 1000; // 4h
const TRENDING_TTL_MS = 4 * 60 * 60 * 1000; // 4h per country

// Maps ISO 3166-1 alpha-2 codes (returned by JamBase) to full country names
// so ShowRecord.country stays consistent with Setlist.fm / Ticketmaster values.
const ISO_COUNTRY_NAMES: Record<string, string> = {
  AR: "Argentina",
  AU: "Australia",
  BR: "Brazil",
  CA: "Canada",
  CL: "Chile",
  CO: "Colombia",
  DE: "Germany",
  ES: "Spain",
  FR: "France",
  GB: "United Kingdom",
  IT: "Italy",
  JP: "Japan",
  MX: "Mexico",
  NL: "Netherlands",
  NZ: "New Zealand",
  PE: "Peru",
  PT: "Portugal",
  US: "United States",
  UY: "Uruguay"
};

type JambaseOffer = {
  url?: string;
  // schema.org uses "https://schema.org/InStock" or plain "InStock"
  availability?: string;
};

type JambaseAddress = {
  addressLocality?: string;
  addressRegion?: string;
  addressCountry?: string; // ISO 3166-1 alpha-2 code
};

type JambaseLocation = {
  name?: string;
  address?: JambaseAddress;
};

type JambasePerformer = {
  name?: string;
  identifier?: string;
};

type JambaseEvent = {
  identifier?: string;
  name?: string;
  startDate?: string; // "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss±hh:mm"
  location?: JambaseLocation;
  // schema.org allows single object or array
  performer?: JambasePerformer | JambasePerformer[];
  offers?: JambaseOffer | JambaseOffer[];
};

type JambaseResponse = {
  events?: JambaseEvent[];
};

function getApiKey(): string {
  return process.env.JAMBASE_API_KEY ?? "";
}

function isInStock(offer: JambaseOffer): boolean {
  const a = offer.availability ?? "";
  return a === "InStock" || a.endsWith("/InStock");
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function jambaseEventToShowRecord(event: JambaseEvent): ShowRecord | null {
  if (!event.identifier) return null;

  // startDate may include time component — take date portion only
  const dateIso = (event.startDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;

  const performers = toArray(event.performer);
  const artistName = performers[0]?.name?.trim() ?? "";
  if (!artistName) return null;

  const addr = event.location?.address;
  const city = [addr?.addressLocality, addr?.addressRegion]
    .filter(Boolean)
    .join(", ");

  const rawCountry = addr?.addressCountry ?? "";
  const country = ISO_COUNTRY_NAMES[rawCountry.toUpperCase()] ?? rawCountry;

  const offers = toArray(event.offers);
  const activeOffer = offers.find(isInStock);
  const ticketUrl = activeOffer?.url;

  const eventName = event.name?.trim() ?? "";
  const tourName = eventName && eventName !== artistName ? eventName : undefined;

  return {
    id: `jb-${event.identifier}`,
    artist: artistName,
    venue: event.location?.name?.trim() ?? "",
    city,
    country,
    eventDateIso: dateIso,
    ticketUrl,
    tourName
  };
}

export async function searchUpcomingByArtistJambase(
  artistName: string
): Promise<ShowRecord[]> {
  const trimmed = artistName.trim();
  if (trimmed.length < 2) return [];

  const apiKey = getApiKey();
  if (!apiKey) return [];

  const cacheKey = `jb:upcoming:${trimmed.toLowerCase()}`;
  const cached = getCacheValue<ShowRecord[]>(cacheKey);
  if (cached) return cached;

  const today = new Date().toISOString().slice(0, 10);

  const params = new URLSearchParams({
    keyword: trimmed,
    startDate: today,
    pageSize: "20"
  });

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/v3/events?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      next: { revalidate: 60 * 60 * 4 }
    });
  } catch {
    return [];
  }

  if (!response.ok) return [];

  let data: JambaseResponse;
  try {
    data = (await response.json()) as JambaseResponse;
  } catch {
    return [];
  }

  const shows = (data.events ?? [])
    .map(jambaseEventToShowRecord)
    .filter((s): s is ShowRecord => s !== null);

  setCacheValue(cacheKey, shows, UPCOMING_TTL_MS);
  return shows;
}

// Country-level cache key (no city/genre) so all users in the same country
// share a single cached result, keeping API quota usage minimal.
export async function searchTrendingJambase(opts: {
  countryCode: string;
}): Promise<ShowRecord[]> {
  const countryCode = opts.countryCode.toUpperCase();

  const apiKey = getApiKey();
  if (!apiKey) return [];

  const cacheKey = `jb:trending:${countryCode.toLowerCase()}`;
  const cached = getCacheValue<ShowRecord[]>(cacheKey);
  if (cached) return cached;

  const today = new Date().toISOString().slice(0, 10);

  const params = new URLSearchParams({
    countryCode,
    startDate: today,
    pageSize: "20"
  });

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/v3/events?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      next: { revalidate: 60 * 60 * 4 }
    });
  } catch {
    return [];
  }

  if (!response.ok) return [];

  let data: JambaseResponse;
  try {
    data = (await response.json()) as JambaseResponse;
  } catch {
    return [];
  }

  const shows = (data.events ?? [])
    .map(jambaseEventToShowRecord)
    .filter((s): s is ShowRecord => s !== null);

  setCacheValue(cacheKey, shows, TRENDING_TTL_MS);
  return shows;
}
