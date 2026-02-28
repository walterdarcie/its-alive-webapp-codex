import { mapSetlistToShowDetailRecord, mapSetlistToShowRecord, type SetlistFmSetlist } from "@/lib/show-types";
import type { ShowRecord } from "@/lib/show-types";
import { resolveArtistImage } from "@/lib/artist-image";

const BASE_URL = "https://api.setlist.fm/rest/1.0";

type SearchPlan = {
  artistName?: string;
  artistMbid?: string;
  cityName?: string;
  year?: string;
  countryCode?: string;
};

type ParsedSearchTerm = {
  artistName: string;
  cityName: string;
  year: string;
  countryCode: string;
  remaining: string;
};

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
    "brazilian": "BR",
    "estados unidos": "US",
    "eua": "US",
    usa: "US",
    "u.s.a": "US",
    "u.s.": "US",
    "united states": "US",
    america: "US",
    "north america": "US",
    canada: "CA",
    mexico: "MX",
    "méxico": "MX",
    argentina: "AR",
    chile: "CL",
    uruguay: "UY",
    paraguay: "PY",
    peru: "PE",
    colombia: "CO",
    "colômbia": "CO",
    bolivia: "BO",
    equador: "EC",
    ecuador: "EC",
    venezuela: "VE",
    espanha: "ES",
    spain: "ES",
    portugal: "PT",
    france: "FR",
    franca: "FR",
    germany: "DE",
    alemanha: "DE",
    deutschland: "DE",
    italy: "IT",
    italia: "IT",
    "países baixos": "NL",
    "paises baixos": "NL",
    netherlands: "NL",
    holland: "NL",
    belgica: "BE",
    belgium: "BE",
    suica: "CH",
    suiça: "CH",
    switzerland: "CH",
    austria: "AT",
    austrália: "AU",
    australia: "AU",
    japao: "JP",
    japão: "JP",
    japan: "JP",
    coreia: "KR",
    "south korea": "KR",
    "korea do sul": "KR",
    uk: "GB",
    "u.k.": "GB",
    gb: "GB",
    britain: "GB",
    "great britain": "GB",
    "united kingdom": "GB",
    inglaterra: "GB",
    england: "GB",
    ireland: "IE",
    irlanda: "IE"
  };

  if (/^[A-Za-z]{2}$/.test(countryName.trim())) {
    return countryName.trim().toUpperCase();
  }

  return mapping[normalized] ?? "";
}

const FREQUENT_CITY_PHRASES = [
  "sao paulo",
  "são paulo",
  "rio de janeiro",
  "belo horizonte",
  "porto alegre",
  "curitiba",
  "brasilia",
  "brasília",
  "buenos aires",
  "santiago",
  "mexico city",
  "ciudad de mexico",
  "cidade do mexico",
  "new york",
  "los angeles",
  "san francisco",
  "las vegas",
  "london",
  "paris",
  "madrid",
  "barcelona",
  "lisbon",
  "lisboa",
  "berlin",
  "rome",
  "milan",
  "tokyo"
] as const;

function normalizeLoose(input: string) {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractKnownCityPhrase(remaining: string) {
  const normalizedLoose = normalizeLoose(remaining);
  for (const city of FREQUENT_CITY_PHRASES) {
    const cityNorm = normalizeLoose(city);
    if (!normalizedLoose.endsWith(cityNorm)) continue;

    const rawWords = remaining.trim().split(/\s+/);
    const cityWordCount = city.split(/\s+/).length;
    if (rawWords.length <= cityWordCount) continue;

    const cityName = rawWords.slice(-cityWordCount).join(" ");
    const artistHead = rawWords.slice(0, -cityWordCount).join(" ").trim();
    if (!artistHead) continue;

    return { artistHead, cityName };
  }
  return null;
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
    return { artistName, cityName, year, countryCode, remaining };
  }

  // Secondary path: "artista em cidade" / "artist in city" / "artist @ city"
  const keywordSplit = /\s(?:em|in|@)\s/i.exec(remaining);
  if (keywordSplit && keywordSplit.index > 0) {
    const left = remaining.slice(0, keywordSplit.index).trim();
    const right = remaining.slice(keywordSplit.index + keywordSplit[0].length).trim();
    if (left && right) {
      artistName = left;
      cityName = right;
      return { artistName, cityName, year, countryCode, remaining };
    }
  }

  // Quoted artist, e.g. "guns n' roses" sao paulo
  const quotedArtist = /^"(.+?)"\s+(.+)$/.exec(remaining);
  if (quotedArtist) {
    artistName = quotedArtist[1].trim();
    cityName = quotedArtist[2].trim();
    return { artistName, cityName, year, countryCode, remaining };
  }

  // Fallback: preserve full text as artist query so compound names still work.
  const withCountryTail = extractTrailingCountry(remaining);
  if (withCountryTail) {
    artistName = withCountryTail.head;
    countryCode = withCountryTail.countryCode;
    return { artistName, cityName, year, countryCode, remaining };
  }

  const knownCity = extractKnownCityPhrase(remaining);
  if (knownCity) {
    artistName = knownCity.artistHead;
    cityName = knownCity.cityName;
    return { artistName, cityName, year, countryCode, remaining };
  }

  artistName = remaining;
  return { artistName, cityName, year, countryCode, remaining };
}

function addPlan(plans: SearchPlan[], seen: Set<string>, plan: SearchPlan) {
  const normalizedPlan: SearchPlan = {
    artistName: plan.artistName?.trim() || undefined,
    artistMbid: plan.artistMbid?.trim() || undefined,
    cityName: plan.cityName?.trim() || undefined,
    year: plan.year?.trim() || undefined,
    countryCode: plan.countryCode?.trim() || undefined
  };

  if (!normalizedPlan.artistName && !normalizedPlan.artistMbid && !normalizedPlan.cityName) return;

  const key = JSON.stringify(normalizedPlan);
  if (seen.has(key)) return;
  seen.add(key);
  plans.push(normalizedPlan);
}

function buildSearchPlans(searchTerm: string) {
  const parsed = parseSearchTerm(searchTerm);
  const plans: SearchPlan[] = [];
  const seen = new Set<string>();

  addPlan(plans, seen, {
    artistName: parsed.artistName,
    cityName: parsed.cityName,
    year: parsed.year,
    countryCode: parsed.countryCode
  });

  if (parsed.remaining && parsed.remaining !== parsed.artistName) {
    addPlan(plans, seen, {
      artistName: parsed.remaining,
      year: parsed.year
    });
  }

  const trailingCountry = extractTrailingCountry(parsed.remaining);
  const partitionCountry = parsed.countryCode || trailingCountry?.countryCode || "";
  const partitionBase = parsed.cityName ? "" : trailingCountry?.head ?? parsed.remaining;

  if (partitionBase) {
    const words = partitionBase.split(" ").filter(Boolean);
    for (let citySize = Math.min(3, words.length - 1); citySize >= 1; citySize -= 1) {
      const artistWords = words.slice(0, -citySize);
      const cityWords = words.slice(-citySize);
      if (!artistWords.length || !cityWords.length) continue;

      addPlan(plans, seen, {
        artistName: artistWords.join(" "),
        cityName: cityWords.join(" "),
        year: parsed.year,
        countryCode: partitionCountry || undefined
      });
    }
  }

  addPlan(plans, seen, { artistName: normalizeSearchText(searchTerm) });

  if (parsed.artistName) {
    const artistLower = normalizeLoose(parsed.artistName);
    if (artistLower === "acdc" || artistLower === "ac dc") {
      addPlan(plans, seen, {
        artistName: "AC/DC",
        cityName: parsed.cityName,
        year: parsed.year,
        countryCode: parsed.countryCode
      });
      addPlan(plans, seen, { artistName: "AC/DC", year: parsed.year });
    }
  }

  return plans.slice(0, 5);
}

type SetlistFmVenueSearchResult = {
  venue?:
    | {
        id?: string;
        name?: string;
        url?: string;
        city?: {
          name?: string;
          stateCode?: string;
          state?: string;
          country?: {
            code?: string;
            name?: string;
          };
        };
      }
    | Array<{
        id?: string;
        name?: string;
        url?: string;
        city?: {
          name?: string;
          stateCode?: string;
          state?: string;
          country?: {
            code?: string;
            name?: string;
          };
        };
      }>;
};

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripHtmlTags(input: string) {
  return decodeHtmlEntities(input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function toIsoFromEnglishDate(monthAbbr: string, dayText: string, yearText: string) {
  const monthMap: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12
  };

  const month = monthMap[monthAbbr.toLowerCase()];
  const day = Number.parseInt(dayText, 10);
  const year = Number.parseInt(yearText, 10);
  if (!month || !Number.isFinite(day) || !Number.isFinite(year)) return "";

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function artistLikelyMatches(queryArtist: string, candidateArtist: string) {
  const q = normalizeArtistNameForMatch(queryArtist);
  const c = normalizeArtistNameForMatch(candidateArtist);
  if (!q || !c) return false;
  if (q === c) return true;
  if (q.includes(c) || c.includes(q)) return true;

  const qTokens = normalizeLoose(queryArtist).split(" ").filter(Boolean);
  const cTokens = normalizeLoose(candidateArtist).split(" ").filter(Boolean);
  const overlap = qTokens.filter((token) => cTokens.includes(token)).length;
  return overlap >= Math.min(2, qTokens.length);
}

async function fetchVenueCandidates(parsed: ParsedSearchTerm) {
  if (!parsed.cityName) {
    return [] as Array<{ id: string; name: string; url: string; city: string; countryCode: string; countryName: string }>;
  }

  const params = new URLSearchParams({
    cityName: parsed.cityName,
    p: "1"
  });

  if (parsed.countryCode) {
    params.set("country", parsed.countryCode);
  }

  const response = await fetch(`${BASE_URL}/search/venues?${params.toString()}`, {
    headers: getHeaders(),
    next: { revalidate: 60 * 60 * 24 }
  });

  if (!response.ok) {
    return [] as Array<{ id: string; name: string; url: string; city: string; countryCode: string; countryName: string }>;
  }

  const payload = (await response.json()) as SetlistFmVenueSearchResult;
  const venues = Array.isArray(payload.venue) ? payload.venue : payload.venue ? [payload.venue] : [];
  const normalizedCity = normalizeLoose(parsed.cityName);

  return venues
    .map((venue) => ({
      id: venue.id ?? "",
      name: venue.name ?? "",
      url: venue.url ?? "",
      city: venue.city?.name ?? "",
      countryCode: (venue.city?.country?.code ?? "").toUpperCase(),
      countryName: venue.city?.country?.name ?? ""
    }))
    .filter((venue) => venue.id && venue.url)
    .filter((venue) => {
      if (!normalizedCity) return true;
      return normalizeLoose(venue.city).includes(normalizedCity) || normalizedCity.includes(normalizeLoose(venue.city));
    })
    .filter((venue) => {
      if (!parsed.countryCode) return true;
      return venue.countryCode === parsed.countryCode;
    })
    .slice(0, 6);
}

function parseUpcomingShowsFromVenueHtml(
  html: string,
  parsed: ParsedSearchTerm,
  venue: { id: string; name: string; city: string; countryCode: string; countryName: string }
) {
  const upcomingSectionStart = html.search(/Upcoming Shows/i);
  if (upcomingSectionStart < 0) return [] as ShowRecord[];

  const section = html.slice(upcomingSectionStart, upcomingSectionStart + 70000);
  const rowRegex = /<li[^>]*>[\s\S]{0,1600}\/upcoming\/[^"]+[\s\S]{0,1600}<\/li>/gi;
  const rows = section.match(rowRegex) ?? [];
  const upcomingShows: ShowRecord[] = [];

  for (const row of rows) {
    const linkMatch = /href="([^"]*\/upcoming\/[^"]+)"/i.exec(row);
    if (!linkMatch) continue;

    const fullUrl = linkMatch[1].startsWith("http") ? linkMatch[1] : `https://www.setlist.fm${linkMatch[1]}`;
    const rowText = stripHtmlTags(row);
    const dateMatch = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})\b/i.exec(rowText);
    if (!dateMatch) continue;

    const eventDateIso = toIsoFromEnglishDate(dateMatch[1], dateMatch[2], dateMatch[3]);
    if (!eventDateIso) continue;
    if (parsed.year && !eventDateIso.startsWith(parsed.year)) continue;

    let artist = "";
    const afterDate = rowText.slice(dateMatch.index + dateMatch[0].length).trim();
    const venuePos = afterDate.toLowerCase().indexOf(venue.name.toLowerCase());
    if (venuePos > 0) {
      artist = afterDate.slice(0, venuePos).trim();
    } else {
      const slugMatch = /\/upcoming\/([^/]+)\/\d{4}\//.exec(fullUrl);
      if (slugMatch) {
        artist = decodeURIComponent(slugMatch[1]).replace(/-/g, " ").trim();
      }
    }

    if (!artistLikelyMatches(parsed.artistName, artist)) continue;

    const idBase = normalizeArtistNameForMatch(artist || parsed.artistName).slice(0, 32) || "artist";
    const showId = `upcoming-${venue.id}-${eventDateIso}-${idBase}`;

    upcomingShows.push({
      id: showId,
      artist: artist || parsed.artistName,
      venue: venue.name,
      city: venue.city,
      country: venue.countryName || parsed.countryCode || venue.countryCode,
      eventDateIso,
      setlistUrl: fullUrl
    });
  }

  const unique = new Map<string, ShowRecord>();
  for (const show of upcomingShows) {
    unique.set(show.id, show);
  }

  return Array.from(unique.values()).sort((a, b) => (a.eventDateIso < b.eventDateIso ? -1 : 1));
}

async function searchUpcomingShowsByVenueFallback(parsed: ParsedSearchTerm) {
  const venues = await fetchVenueCandidates(parsed);
  if (!venues.length) {
    return {
      shows: [] as ShowRecord[],
      page: 1,
      total: 0,
      itemsPerPage: 0
    };
  }

  for (const venue of venues) {
    const response = await fetch(venue.url, {
      headers: {
        Accept: "text/html",
        "User-Agent": "It's Alive (walter.darcie@yahoo.com.br)"
      },
      next: { revalidate: 60 * 60 * 6 }
    });

    if (!response.ok) continue;
    const html = await response.text();
    const shows = parseUpcomingShowsFromVenueHtml(html, parsed, venue);
    if (shows.length > 0) {
      return {
        shows,
        page: 1,
        total: shows.length,
        itemsPerPage: shows.length
      };
    }
  }

  return {
    shows: [] as ShowRecord[],
    page: 1,
    total: 0,
    itemsPerPage: 0
  };
}

async function fetchSetlistsSearchByPlan(plan: SearchPlan, pageOneBased: number) {
  const params = new URLSearchParams({ p: String(pageOneBased) });
  if (plan.artistName) params.set("artistName", plan.artistName);
  if (plan.artistMbid) params.set("artistMbid", plan.artistMbid);
  if (plan.cityName) params.set("cityName", plan.cityName);
  if (plan.year) params.set("year", plan.year);
  if (plan.countryCode) params.set("countryCode", plan.countryCode);

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
  const shows = normalized.map(mapSetlistToShowRecord).filter((show): show is ShowRecord => Boolean(show));

  return {
    shows,
    page: data.page ?? pageOneBased,
    total: data.total ?? shows.length,
    itemsPerPage: data.itemsPerPage ?? shows.length
  };
}

function normalizeArtistNameForMatch(input: string) {
  return normalizeLoose(input).replace(/[^a-z0-9]/g, "");
}

type SetlistFmArtistSearchResult = {
  artist?:
    | {
        mbid?: string;
        name?: string;
        sortName?: string;
      }
    | Array<{
        mbid?: string;
        name?: string;
        sortName?: string;
      }>;
};

async function fetchArtistMbidsByName(artistName: string) {
  const params = new URLSearchParams({ artistName: artistName.trim(), p: "1" });
  const response = await fetch(`${BASE_URL}/search/artists?${params.toString()}`, {
    headers: getHeaders(),
    next: { revalidate: 60 * 60 * 24 }
  });

  if (!response.ok) {
    return [] as string[];
  }

  const payload = (await response.json()) as SetlistFmArtistSearchResult;
  const rawArtists = Array.isArray(payload.artist) ? payload.artist : payload.artist ? [payload.artist] : [];
  if (!rawArtists.length) return [];

  const queryNorm = normalizeArtistNameForMatch(artistName);
  const scored = rawArtists
    .map((artist) => {
      const name = artist.name ?? artist.sortName ?? "";
      const nameNorm = normalizeArtistNameForMatch(name);
      let score = 0;
      if (nameNorm === queryNorm) score += 120;
      if (nameNorm.includes(queryNorm)) score += 50;
      if (queryNorm.includes(nameNorm)) score += 30;
      if (!artist.mbid) score -= 200;
      return { mbid: artist.mbid ?? "", score };
    })
    .filter((item) => Boolean(item.mbid))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return scored.map((item) => item.mbid);
}

export async function searchSetlists(searchTerm: string, pageZeroBased = 0) {
  const incomingPage = Number.isFinite(pageZeroBased) && pageZeroBased >= 0 ? pageZeroBased : 0;
  const pageOneBased = incomingPage + 1;
  const parsed = parseSearchTerm(searchTerm);
  const plans = buildSearchPlans(searchTerm);
  let emptyResult = {
    shows: [] as ShowRecord[],
    page: pageOneBased,
    total: 0,
    itemsPerPage: 0
  };

  for (const [index, plan] of plans.entries()) {
    const result = await fetchSetlistsSearchByPlan(plan, pageOneBased);

    if (result.shows.length > 0 || result.total > 0) {
      return result;
    }

    emptyResult = result;

    // Stop early on paginated requests to avoid multiplying provider calls during infinite scroll.
    if (pageOneBased > 1 && index === 0) {
      return emptyResult;
    }
  }

  if (pageOneBased === 1 && parsed.artistName) {
    const artistMbids = await fetchArtistMbidsByName(parsed.artistName);
    for (const artistMbid of artistMbids) {
      const result = await fetchSetlistsSearchByPlan(
        {
          artistMbid,
          cityName: parsed.cityName || undefined,
          year: parsed.year || undefined,
          countryCode: parsed.countryCode || undefined
        },
        pageOneBased
      );

      if (result.shows.length > 0 || result.total > 0) {
        return result;
      }

      if (parsed.cityName || parsed.countryCode) {
        const broaderResult = await fetchSetlistsSearchByPlan(
          {
            artistMbid,
            year: parsed.year || undefined
          },
          pageOneBased
        );
        if (broaderResult.shows.length > 0 || broaderResult.total > 0) {
          return broaderResult;
        }
      }
    }
  }

  if (pageOneBased === 1 && parsed.artistName && parsed.cityName) {
    const upcomingFallback = await searchUpcomingShowsByVenueFallback(parsed);
    if (upcomingFallback.shows.length > 0 || upcomingFallback.total > 0) {
      return upcomingFallback;
    }
  }

  return emptyResult;
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

  const artistImage = await resolveArtistImage({
    artistName: show.artist,
    artistMbid: show.artistMbid
  });

  if (artistImage.imageUrl) {
    show.artistImageUrl = artistImage.imageUrl;
    show.artistImagePageUrl = artistImage.pageUrl ?? undefined;
    show.artistImageSource = artistImage.source === "none" ? undefined : artistImage.source;
  }

  return show;
}
