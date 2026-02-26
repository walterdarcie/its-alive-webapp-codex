import { mapSetlistToShowDetailRecord, mapSetlistToShowRecord, type SetlistFmSetlist } from "@/lib/show-types";
import type { ShowRecord } from "@/lib/show-types";

const BASE_URL = "https://api.setlist.fm/rest/1.0";

function getHeaders() {
  const apiKey = process.env.SETLISTFM_API_KEY;
  if (!apiKey) {
    throw new Error("SETLISTFM_API_KEY is not configured");
  }

  return {
    "x-api-key": apiKey,
    Accept: "application/json",
    "User-Agent": "It's Alive (walter.darcie@yahoo.com.br)"
  };
}

function parseSearchTerm(searchTerm: string) {
  const words = searchTerm.trim().split(/\s+/).filter(Boolean);
  let artistName = "";
  let cityName = "";
  let year = "";

  for (const word of words) {
    if (/^\d{4}$/.test(word)) {
      year = word;
    } else if (!artistName) {
      artistName = word;
    } else {
      cityName += cityName ? ` ${word}` : word;
    }
  }

  return { artistName, cityName, year };
}

export async function searchSetlists(searchTerm: string, pageZeroBased = 0) {
  const incomingPage = Number.isFinite(pageZeroBased) && pageZeroBased >= 0 ? pageZeroBased : 0;
  const pageOneBased = incomingPage + 1;

  const { artistName, cityName, year } = parseSearchTerm(searchTerm);
  const params = new URLSearchParams({ p: String(pageOneBased) });
  if (artistName) params.set("artistName", artistName);
  if (cityName) params.set("cityName", cityName);
  if (year) params.set("year", year);

  const response = await fetch(`${BASE_URL}/search/setlists?${params.toString()}`, {
    headers: getHeaders(),
    next: { revalidate: 60 * 60 * 6 }
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Setlist.fm search failed (${response.status}): ${details}`);
  }

  const data = (await response.json()) as {
    setlist?: SetlistFmSetlist | SetlistFmSetlist[];
    page?: number;
    total?: number;
    itemsPerPage?: number;
  };

  const normalized = Array.isArray(data.setlist) ? data.setlist : data.setlist ? [data.setlist] : [];
  const shows = normalized
    .map(mapSetlistToShowRecord)
    .filter((show): show is ShowRecord => Boolean(show));

  return {
    shows,
    page: data.page ?? pageOneBased,
    total: data.total ?? shows.length,
    itemsPerPage: data.itemsPerPage ?? shows.length
  };
}

export async function getSetlistById(id: string) {
  const response = await fetch(`${BASE_URL}/setlist/${encodeURIComponent(id)}`, {
    headers: getHeaders(),
    next: { revalidate: 60 * 60 * 24 }
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Setlist.fm detail failed (${response.status}): ${details}`);
  }

  const data = (await response.json()) as SetlistFmSetlist;
  const show = mapSetlistToShowDetailRecord(data);
  if (!show) {
    throw new Error("Could not normalize Setlist.fm detail response");
  }
  return show;
}
