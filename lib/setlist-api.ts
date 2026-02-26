import { mapSetlistToShowDetailRecord, mapSetlistToShowRecord, type SetlistFmSetlist } from "@/lib/show-types";
import type { ShowRecord } from "@/lib/show-types";

const BASE_URL = "https://api.setlist.fm/rest/1.0";

export class SetlistApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SetlistApiError";
    this.status = status;
  }
}

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

function normalizeSearchText(input: string) {
  return input
    .normalize("NFC")
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseYear(input: string) {
  const match = /(?:^|\s)(19\d{2}|20\d{2})(?:\s|$)/.exec(input);
  if (!match) {
    return { year: "", remaining: input };
  }

  const year = match[1];
  const remaining = `${input.slice(0, match.index)} ${input.slice(match.index + match[0].length)}`
    .replace(/\s+/g, " ")
    .trim();

  return { year, remaining };
}

function countryNameToCode(countryName: string) {
  const normalized = countryName
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

  const mapping: Record<string, string> = {
    brasil: "BR",
    brazil: "BR",
    "estados unidos": "US",
    "eua": "US",
    usa: "US",
    "united states": "US",
    canada: "CA",
    mexico: "MX",
    argentina: "AR",
    chile: "CL",
    uruguay: "UY",
    paraguay: "PY",
    peru: "PE",
    colombia: "CO",
    espanha: "ES",
    spain: "ES",
    portugal: "PT",
    france: "FR",
    franca: "FR",
    germany: "DE",
    alemanha: "DE",
    italy: "IT",
    italia: "IT",
    uk: "GB",
    "united kingdom": "GB",
    inglaterra: "GB"
  };

  if (/^[A-Za-z]{2}$/.test(countryName.trim())) {
    return countryName.trim().toUpperCase();
  }

  return mapping[normalized] ?? "";
}

function extractTrailingCountry(remaining: string) {
  const normalized = remaining.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const words = normalized.split(" ");
  for (let size = Math.min(3, words.length); size >= 1; size -= 1) {
    const tail = words.slice(-size).join(" ");
    const code = countryNameToCode(tail);
    if (!code) continue;

    const head = words.slice(0, -size).join(" ").trim();
    if (!head) continue;

    return {
      head,
      countryCode: code
    };
  }

  return null;
}

function parseSearchTerm(searchTerm: string) {
  const normalized = normalizeSearchText(searchTerm);
  const { year, remaining } = parseYear(normalized);

  let artistName = "";
  let cityName = "";
  let countryCode = "";

  // Best path: explicit separators => "artista, cidade, país" or "artista | cidade | país"
  const pipeSegments = remaining.split("|").map((part) => part.trim()).filter(Boolean);
  const commaSegments = remaining.split(",").map((part) => part.trim()).filter(Boolean);
  const segments = pipeSegments.length >= 2 ? pipeSegments : commaSegments.length >= 2 ? commaSegments : [];

  if (segments.length >= 2) {
    artistName = segments[0];
    cityName = segments[1] ?? "";
    if (segments[2]) {
      countryCode = countryNameToCode(segments[2]);
    }
    return { artistName, cityName, year, countryCode };
  }

  // Secondary path: "artista em cidade" / "artist in city" / "artist @ city"
  const keywordSplit = /\s(?:em|in|@)\s/i.exec(remaining);
  if (keywordSplit && keywordSplit.index > 0) {
    const left = remaining.slice(0, keywordSplit.index).trim();
    const right = remaining.slice(keywordSplit.index + keywordSplit[0].length).trim();
    if (left && right) {
      artistName = left;
      cityName = right;
      return { artistName, cityName, year, countryCode };
    }
  }

  // Quoted artist, e.g. "guns n' roses" sao paulo
  const quotedArtist = /^"(.+?)"\s+(.+)$/.exec(remaining);
  if (quotedArtist) {
    artistName = quotedArtist[1].trim();
    cityName = quotedArtist[2].trim();
    return { artistName, cityName, year, countryCode };
  }

  // Fallback: preserve full text as artist query so compound names still work.
  const withCountryTail = extractTrailingCountry(remaining);
  if (withCountryTail) {
    artistName = withCountryTail.head;
    countryCode = withCountryTail.countryCode;
    return { artistName, cityName, year, countryCode };
  }

  artistName = remaining;
  return { artistName, cityName, year, countryCode };
}

export async function searchSetlists(searchTerm: string, pageZeroBased = 0) {
  const incomingPage = Number.isFinite(pageZeroBased) && pageZeroBased >= 0 ? pageZeroBased : 0;
  const pageOneBased = incomingPage + 1;

  const { artistName, cityName, year, countryCode } = parseSearchTerm(searchTerm);
  const params = new URLSearchParams({ p: String(pageOneBased) });
  if (artistName) params.set("artistName", artistName);
  if (cityName) params.set("cityName", cityName);
  if (year) params.set("year", year);
  if (countryCode) params.set("countryCode", countryCode);

  const response = await fetch(`${BASE_URL}/search/setlists?${params.toString()}`, {
    headers: getHeaders(),
    next: { revalidate: 60 * 60 * 6 }
  });

  if (response.status === 404) {
    return {
      shows: [] as ShowRecord[],
      page: pageOneBased,
      total: 0,
      itemsPerPage: 0
    };
  }

  if (!response.ok) {
    const details = await response.text();
    throw new SetlistApiError(response.status, `Setlist.fm search failed (${response.status}): ${details}`);
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
    throw new SetlistApiError(response.status, `Setlist.fm detail failed (${response.status}): ${details}`);
  }

  const data = (await response.json()) as SetlistFmSetlist;
  const show = mapSetlistToShowDetailRecord(data);
  if (!show) {
    throw new Error("Could not normalize Setlist.fm detail response");
  }
  return show;
}
