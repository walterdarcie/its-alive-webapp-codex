import { mapSetlistToShowDetailRecord, mapSetlistToShowRecord, type SetlistFmSetlist } from "@/lib/show-types";
import type { ShowRecord } from "@/lib/show-types";

const BASE_URL = "https://api.setlist.fm/rest/1.0";

type SearchPlan = {
  artistName?: string;
  cityName?: string;
  year?: string;
  countryCode?: string;
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
    "france": "FR",
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
    cityName: plan.cityName?.trim() || undefined,
    year: plan.year?.trim() || undefined,
    countryCode: plan.countryCode?.trim() || undefined
  };

  if (!normalizedPlan.artistName && !normalizedPlan.cityName) return;

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

  return plans.slice(0, 5);
}

async function fetchSetlistsSearchByPlan(plan: SearchPlan, pageOneBased: number) {
  const params = new URLSearchParams({ p: String(pageOneBased) });
  if (plan.artistName) params.set("artistName", plan.artistName);
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

export async function searchSetlists(searchTerm: string, pageZeroBased = 0) {
  const incomingPage = Number.isFinite(pageZeroBased) && pageZeroBased >= 0 ? pageZeroBased : 0;
  const pageOneBased = incomingPage + 1;
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
  return show;
}
