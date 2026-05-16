import { mapSetlistToShowDetailRecord, mapSetlistToShowRecord, type SetlistFmSetlist } from "@/lib/show-types";
import type { ShowRecord } from "@/lib/show-types";
import { resolveArtistImage } from "@/lib/artist-image";
import { getCacheValue, setCacheValue } from "@/lib/setlist-cache";
import { getKnownArtistsClient } from "@/lib/supabase/known-artists-client";

const BASE_URL = "https://api.setlist.fm/rest/1.0";

const ARTIST_LOOKUP_TTL_MS = 1000 * 60 * 60 * 24;
const ARTIST_LOOKUP_NEG_TTL_MS = 1000 * 60 * 30;
const MAX_ARTIST_RESOLVE_API_CALLS = 3;
const MAX_ARTIST_CANDIDATES = 3;
const STRONG_ARTIST_MATCH_SCORE = 1000;
const MIN_ACCEPTABLE_ARTIST_SCORE = 400;

const KNOWN_ARTIST_MBIDS: Record<string, { mbid: string; name: string }> = {
  "iron maiden": { mbid: "ca891d65-d9b0-4258-89f7-e6ba29d83767", name: "Iron Maiden" },
  metallica: { mbid: "65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab", name: "Metallica" },
  "ac/dc": { mbid: "66c662b6-6e2f-4930-8610-912e24c63ed1", name: "AC/DC" },
  "guns n' roses": { mbid: "eeb1195b-f213-4ce1-b28c-8565211f8e43", name: "Guns N' Roses" },
  "the rolling stones": { mbid: "b071f9fa-14b0-4217-8e97-eb41da73f598", name: "The Rolling Stones" },
  "pink floyd": { mbid: "83d91898-7763-47d7-b03b-b92132375c47", name: "Pink Floyd" },
  "foo fighters": { mbid: "67f66c07-6e61-4026-ade5-7e782fad3a5d", name: "Foo Fighters" },
  "led zeppelin": { mbid: "678d88b2-87b0-403b-b63d-5da7465aecc3", name: "Led Zeppelin" },
  queen: { mbid: "0383dadf-2a4e-4d10-a46a-e9e041da8eb3", name: "Queen" },
  "the beatles": { mbid: "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d", name: "The Beatles" },
  u2: { mbid: "a3cb23fc-acd3-4ce0-8f36-1e5aa6a18432", name: "U2" },
  nirvana: { mbid: "5b11f4ce-a62d-471e-81fc-a69a8278c7da", name: "Nirvana" },
  coldplay: { mbid: "cc197bad-dc9c-440d-a5b5-d52ba2e14234", name: "Coldplay" },
  radiohead: { mbid: "a74b1b7f-71a5-4011-9441-d0b5e4122711", name: "Radiohead" },
  oasis: { mbid: "39ab1aed-75e0-4140-bd47-540276886b60", name: "Oasis" },
  "red hot chili peppers": { mbid: "8bfac288-ccc5-448d-9573-c33ea2aa5c30", name: "Red Hot Chili Peppers" },
  "system of a down": { mbid: "cc0b7089-c08d-4c10-b6b0-873582c17fd6", name: "System of a Down" },
  "linkin park": { mbid: "f59c5520-5f46-4d2c-b2c4-822eabf53419", name: "Linkin Park" },
  "pearl jam": { mbid: "83b9cbe7-9857-49e2-ab8e-b57b01038103", name: "Pearl Jam" },
  "the strokes": { mbid: "f181961b-20f7-459e-89de-920ef03c7ed0", name: "The Strokes" },
  "arctic monkeys": { mbid: "ada7a83c-e3e1-40f1-93f9-3e73dbc9298a", name: "Arctic Monkeys" },
  angra: { mbid: "6c4c2eaa-13aa-4f50-b6a5-fc83b1390aa9", name: "Angra" },
  sepultura: { mbid: "e6041d2c-1d5f-49a2-b48d-7d7466b2f9aa", name: "Sepultura" }
};

type SearchPlan = {
  artistName?: string;
  artistMbid?: string;
  venueName?: string;
  cityName?: string;
  tourName?: string;
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

type StructuredQuery = {
  explicitArtist: string;
  explicitCity: string;
  year: string;
  countryCode: string;
  coreText: string;
};

type ArtistCandidate = {
  mbid: string;
  name: string;
  sortName: string;
};

type ResolvedArtistMatch = {
  mbid: string;
  name: string;
  matchedPrefix: string;
  remaining: string;
  score: number;
};

type SearchResultPayload = {
  shows: ShowRecord[];
  page: number;
  total: number;
  itemsPerPage: number;
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

function normalizeLoose(input: string) {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeArtistNameForMatch(input: string) {
  return normalizeLoose(input).replace(/[^a-z0-9]/g, "");
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

const COUNTRY_CODE_FALLBACK_ALLOWLIST = new Set([
  "AR", "AT", "AU", "BE", "BO", "BR", "CA", "CH", "CL", "CO", "CZ", "DE", "DK", "EC", "ES", "FI", "FR",
  "GB", "GR", "HU", "IE", "IL", "IS", "IT", "JP", "KR", "MX", "NL", "NO", "NZ", "PE", "PL", "PT", "PY",
  "RO", "RU", "SE", "TR", "US", "UY", "VE", "ZA"
]);

function countryNameToCode(countryName: string, options: { allowTwoLetterFallback?: boolean } = {}) {
  const trimmed = countryName.trim();
  if (!trimmed) return "";

  const normalized = normalizeLoose(trimmed);

  const mapping: Record<string, string> = {
    brasil: "BR",
    brazil: "BR",
    brazilian: "BR",
    "estados unidos": "US",
    eua: "US",
    usa: "US",
    "u.s.a": "US",
    "u.s.": "US",
    "united states": "US",
    america: "US",
    "north america": "US",
    canada: "CA",
    mexico: "MX",
    argentina: "AR",
    chile: "CL",
    uruguay: "UY",
    uruguai: "UY",
    paraguay: "PY",
    paraguai: "PY",
    peru: "PE",
    colombia: "CO",
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
    "paises baixos": "NL",
    netherlands: "NL",
    holland: "NL",
    belgica: "BE",
    belgium: "BE",
    suica: "CH",
    switzerland: "CH",
    austria: "AT",
    australia: "AU",
    japao: "JP",
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

  const direct = mapping[normalized];
  if (direct) return direct;

  if (options.allowTwoLetterFallback && /^[A-Za-z]{2}$/.test(trimmed)) {
    const upper = trimmed.toUpperCase();
    if (COUNTRY_CODE_FALLBACK_ALLOWLIST.has(upper)) return upper;
  }

  return "";
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

function applyArtistAliases(text: string) {
  const lower = normalizeLoose(text).replace(/['"`’‘]/g, "");
  if (!lower) return text;
  const aliasMap: Record<string, string> = {
    acdc: "AC/DC",
    "ac dc": "AC/DC",
    "ac/dc": "AC/DC",
    "guns n roses": "Guns N' Roses",
    "guns and roses": "Guns N' Roses",
    gnr: "Guns N' Roses"
  };
  return aliasMap[lower] ?? text;
}

function parseStructuredQuery(searchTerm: string): StructuredQuery {
  const normalized = normalizeSearchText(searchTerm);
  if (!normalized) {
    return { explicitArtist: "", explicitCity: "", year: "", countryCode: "", coreText: "" };
  }

  const pipeSegments = normalized.split("|").map((part) => part.trim()).filter(Boolean);
  const commaSegments = normalized.split(",").map((part) => part.trim()).filter(Boolean);
  const segments = pipeSegments.length >= 2 ? pipeSegments : commaSegments.length >= 2 ? commaSegments : [];

  if (segments.length >= 2) {
    const explicitArtist = applyArtistAliases(segments[0] ?? "");
    let explicitCity = "";
    let year = "";
    let countryCode = "";

    for (const seg of segments.slice(1)) {
      if (!year) {
        const yearMatch = /^(19\d{2}|20\d{2})$/.exec(seg);
        if (yearMatch) {
          year = yearMatch[1];
          continue;
        }
      }
      if (!countryCode) {
        const code = countryNameToCode(seg, { allowTwoLetterFallback: true });
        if (code) {
          countryCode = code;
          continue;
        }
      }
      if (!explicitCity) {
        explicitCity = seg;
      }
    }

    return { explicitArtist, explicitCity, year, countryCode, coreText: explicitArtist };
  }

  const keywordSplit = /\s(?:em|in|@)\s/i.exec(normalized);
  if (keywordSplit && keywordSplit.index > 0) {
    const left = normalized.slice(0, keywordSplit.index).trim();
    const right = normalized.slice(keywordSplit.index + keywordSplit[0].length).trim();
    if (left && right) {
      const { year, remaining: rightAfterYear } = parseYear(right);
      const trailingCountry = extractTrailingCountry(rightAfterYear);
      const explicitCity = (trailingCountry ? trailingCountry.head : rightAfterYear).trim();
      const countryCode = trailingCountry?.countryCode ?? "";
      const explicitArtist = applyArtistAliases(left);
      return { explicitArtist, explicitCity, year, countryCode, coreText: explicitArtist };
    }
  }

  const quotedArtist = /^"(.+?)"\s+(.+)$/.exec(normalized);
  if (quotedArtist) {
    const right = quotedArtist[2].trim();
    const { year, remaining: rightAfterYear } = parseYear(right);
    const trailingCountry = extractTrailingCountry(rightAfterYear);
    const explicitCity = (trailingCountry ? trailingCountry.head : rightAfterYear).trim();
    const countryCode = trailingCountry?.countryCode ?? "";
    const explicitArtist = applyArtistAliases(quotedArtist[1].trim());
    return { explicitArtist, explicitCity, year, countryCode, coreText: explicitArtist };
  }

  const { year, remaining: afterYear } = parseYear(normalized);
  const trailingCountry = extractTrailingCountry(afterYear);
  const countryCode = trailingCountry?.countryCode ?? "";
  const coreText = applyArtistAliases((trailingCountry ? trailingCountry.head : afterYear).trim());

  return { explicitArtist: "", explicitCity: "", year, countryCode, coreText };
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

async function fetchArtistsByName(artistName: string): Promise<ArtistCandidate[]> {
  const trimmed = artistName.trim();
  if (!trimmed) return [];

  const cacheKey = `artists:${normalizeLoose(trimmed)}`;
  const cached = getCacheValue<ArtistCandidate[]>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({ artistName: trimmed, p: "1" });

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/search/artists?${params.toString()}`, {
      headers: getHeaders(),
      next: { revalidate: 60 * 60 * 24 }
    });
  } catch {
    return [];
  }

  if (response.status === 404) {
    setCacheValue(cacheKey, [], ARTIST_LOOKUP_NEG_TTL_MS);
    return [];
  }

  if (!response.ok) {
    return [];
  }

  let payload: SetlistFmArtistSearchResult;
  try {
    payload = (await response.json()) as SetlistFmArtistSearchResult;
  } catch {
    return [];
  }

  const raw = Array.isArray(payload.artist) ? payload.artist : payload.artist ? [payload.artist] : [];
  const normalized: ArtistCandidate[] = raw
    .map((a) => ({ mbid: a.mbid ?? "", name: a.name ?? "", sortName: a.sortName ?? "" }))
    .filter((a) => a.mbid && a.name);

  setCacheValue(cacheKey, normalized, ARTIST_LOOKUP_TTL_MS);
  return normalized;
}

function scoreArtistAgainstPrefix(prefix: string, artist: ArtistCandidate, prefixWordCount: number) {
  const prefixNorm = normalizeArtistNameForMatch(prefix);
  if (!prefixNorm) return 0;
  const nameNorm = normalizeArtistNameForMatch(artist.name);
  const sortNorm = normalizeArtistNameForMatch(artist.sortName);
  const wordBonus = prefixWordCount * 10;

  if (nameNorm === prefixNorm) return STRONG_ARTIST_MATCH_SCORE + wordBonus;
  if (sortNorm === prefixNorm) return STRONG_ARTIST_MATCH_SCORE - 100 + wordBonus;
  if (nameNorm.startsWith(prefixNorm)) {
    const remaining = nameNorm.length - prefixNorm.length;
    if (remaining <= 4) return 600 + wordBonus;
    if (prefixNorm.length >= 4) return 480 + wordBonus;
  }
  if (prefixNorm.startsWith(nameNorm) && nameNorm.length >= 3) {
    return MIN_ACCEPTABLE_ARTIST_SCORE + wordBonus;
  }
  return 0;
}

type ArtistWindow = {
  artistText: string;
  artistKey: string;
  remaining: string;
  wordCount: number;
  startIdx: number;
};

// Generates every contiguous word window (longest first, then left-to-right).
// Lets us match a known artist anywhere in the query — not just at the prefix —
// so "São Paulo Metallica" or "Bogotá Tame Imp" resolve the artist correctly.
function generateContiguousWindows(words: string[]): ArtistWindow[] {
  const result: ArtistWindow[] = [];
  for (let len = words.length; len >= 1; len--) {
    for (let start = 0; start <= words.length - len; start++) {
      const end = start + len;
      const artistText = words.slice(start, end).join(" ");
      const artistKey = normalizeLoose(artistText).replace(/['"`’‘]/g, "");
      const remaining = [...words.slice(0, start), ...words.slice(end)].join(" ").trim();
      result.push({ artistText, artistKey, remaining, wordCount: len, startIdx: start });
    }
  }
  return result;
}

function findKnownArtistInQuery(coreText: string): ResolvedArtistMatch | null {
  const normalized = normalizeSearchText(coreText);
  if (!normalized) return null;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (!words.length) return null;

  for (const win of generateContiguousWindows(words)) {
    if (!win.artistKey) continue;
    const known = KNOWN_ARTIST_MBIDS[win.artistKey];
    if (known) {
      return {
        mbid: known.mbid,
        name: known.name,
        matchedPrefix: win.artistText,
        remaining: win.remaining,
        score: STRONG_ARTIST_MATCH_SCORE + win.wordCount * 20
      };
    }
  }
  return null;
}

async function lookupArtistInDb(coreText: string): Promise<ResolvedArtistMatch | null> {
  const supabase = getKnownArtistsClient();
  if (!supabase) return null;

  const normalized = normalizeSearchText(coreText);
  if (!normalized) return null;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (!words.length) return null;

  const windows = generateContiguousWindows(words);
  const uniqueKeys = Array.from(new Set(windows.map((w) => w.artistKey).filter(Boolean)));
  if (!uniqueKeys.length) return null;

  // Cache key is the normalized full query so different orderings hit the same entry.
  const fullKey = normalizeLoose(normalized).replace(/['"`’‘]/g, "");
  const cacheKey = `known_artist_db:${fullKey}`;
  const cached = getCacheValue<ResolvedArtistMatch>(cacheKey);
  if (cached) return cached;

  try {
    // Batched exact match across all windows in a single IN query.
    const { data: exactData } = await supabase
      .from("known_artists")
      .select("mbid, canonical_name, name_normalized")
      .in("name_normalized", uniqueKeys)
      .limit(uniqueKeys.length * 4);

    const exactMap = new Map<string, Array<{ mbid: string; canonical_name: string; name_normalized: string }>>();
    for (const row of exactData ?? []) {
      const k = row.name_normalized as string;
      const list = exactMap.get(k) ?? [];
      list.push(row as { mbid: string; canonical_name: string; name_normalized: string });
      exactMap.set(k, list);
    }

    // Iterate by length DESC. At each length, try exact match for every window
    // first; if nothing exact, try prefix-LIKE on suffix windows (the user's
    // partial typing usually ends at the cursor). Stop on first hit so longer
    // matches always beat shorter ones — "tame imp" wins over a bare "tame".
    for (let len = words.length; len >= 1; len--) {
      const sameLen = windows.filter((w) => w.wordCount === len);

      for (const win of sameLen) {
        const rows = exactMap.get(win.artistKey);
        if (rows && rows.length) {
          const canonical = pickCanonicalRow(rows, win.artistKey);
          const result: ResolvedArtistMatch = {
            mbid: canonical.mbid,
            name: canonical.name,
            matchedPrefix: win.artistText,
            remaining: win.remaining,
            score: STRONG_ARTIST_MATCH_SCORE + len * 20
          };
          setCacheValue(cacheKey, result, ARTIST_LOOKUP_TTL_MS);
          return result;
        }
      }

      const suffixWindows = sameLen.filter((w) => w.startIdx + len === words.length);
      for (const win of suffixWindows) {
        if (win.artistKey.length < 4) continue;
        const { data: likeData } = await supabase
          .from("known_artists")
          .select("mbid, canonical_name, name_normalized")
          .like("name_normalized", `${win.artistKey}%`)
          .order("name_normalized", { ascending: true })
          .limit(20);

        if (likeData && likeData.length > 0) {
          const queryNorm = normalizeArtistNameForMatch(win.artistKey);
          const valid = likeData
            .map((row) => ({
              mbid: row.mbid as string,
              name: row.canonical_name as string,
              nameNormDb: row.name_normalized as string,
              nameNorm: normalizeArtistNameForMatch(row.canonical_name as string)
            }))
            .filter((c) => c.nameNorm.startsWith(queryNorm))
            // Shortest alphanumeric-normalized name wins. Favors "beyonce" over
            // "beyon-d-lusion" and avoids special-char-laden noise.
            .sort((a, b) => a.nameNorm.length - b.nameNorm.length);

          if (valid.length > 0) {
            const firstName = valid[0].nameNormDb;
            const canonical = KNOWN_ARTIST_MBIDS[firstName];
            const best = canonical
              ? { mbid: canonical.mbid, name: canonical.name }
              : { mbid: valid[0].mbid, name: valid[0].name };
            const result: ResolvedArtistMatch = {
              mbid: best.mbid,
              name: best.name,
              matchedPrefix: win.artistText,
              remaining: win.remaining,
              score: STRONG_ARTIST_MATCH_SCORE + len * 20 - 5
            };
            setCacheValue(cacheKey, result, ARTIST_LOOKUP_TTL_MS);
            return result;
          }
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

function pickCanonicalRow(
  rows: Array<{ mbid: unknown; canonical_name: unknown; name_normalized: unknown }>,
  nameKey: string
): { mbid: string; name: string } {
  const canonical = KNOWN_ARTIST_MBIDS[nameKey];
  if (canonical) return { mbid: canonical.mbid, name: canonical.name };
  const first = rows[0];
  return { mbid: first.mbid as string, name: first.canonical_name as string };
}

async function findKnownArtistFromPrefixWithDb(coreText: string): Promise<ResolvedArtistMatch | null> {
  const hardcoded = findKnownArtistInQuery(coreText);
  if (hardcoded) return hardcoded;
  return lookupArtistInDb(coreText);
}

async function resolveArtistCandidatesFromCore(coreText: string): Promise<ResolvedArtistMatch[]> {
  const normalized = normalizeSearchText(coreText);
  if (!normalized) return [];

  const words = normalized.split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const matches = new Map<string, ResolvedArtistMatch>();

  const known = await findKnownArtistFromPrefixWithDb(coreText);
  if (known) {
    matches.set(known.mbid, known);
  }

  let apiCalls = 0;
  let bestScoreSeen = known ? known.score : 0;
  const seenKeys = new Set<string>();

  for (const win of generateContiguousWindows(words)) {
    if (apiCalls >= MAX_ARTIST_RESOLVE_API_CALLS) break;
    if (!win.artistKey || seenKeys.has(win.artistKey)) continue;
    if (!normalizeArtistNameForMatch(win.artistText)) continue;
    seenKeys.add(win.artistKey);

    apiCalls += 1;
    const candidates = await fetchArtistsByName(win.artistText);
    if (!candidates.length) continue;

    for (const candidate of candidates) {
      const score = scoreArtistAgainstPrefix(win.artistText, candidate, win.wordCount);
      if (!score || score < MIN_ACCEPTABLE_ARTIST_SCORE) continue;
      bestScoreSeen = Math.max(bestScoreSeen, score);
      const existing = matches.get(candidate.mbid);
      if (!existing || score > existing.score) {
        matches.set(candidate.mbid, {
          mbid: candidate.mbid,
          name: candidate.name,
          matchedPrefix: win.artistText,
          remaining: win.remaining,
          score
        });
      }
    }

    if (bestScoreSeen >= STRONG_ARTIST_MATCH_SCORE) {
      break;
    }
  }

  return Array.from(matches.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ARTIST_CANDIDATES);
}

async function resolveArtistFromCore(coreText: string): Promise<ResolvedArtistMatch | null> {
  const list = await resolveArtistCandidatesFromCore(coreText);
  return list.length ? list[0] : null;
}

function addUniquePlan(plans: SearchPlan[], seen: Set<string>, plan: SearchPlan) {
  const normalized: SearchPlan = {
    artistName: plan.artistName?.trim() || undefined,
    artistMbid: plan.artistMbid?.trim() || undefined,
    venueName: plan.venueName?.trim() || undefined,
    cityName: plan.cityName?.trim() || undefined,
    tourName: plan.tourName?.trim() || undefined,
    year: plan.year?.trim() || undefined,
    countryCode: plan.countryCode?.trim() || undefined
  };

  if (!normalized.artistName && !normalized.artistMbid && !normalized.venueName && !normalized.cityName && !normalized.tourName) {
    return;
  }

  const key = JSON.stringify(normalized);
  if (seen.has(key)) return;
  seen.add(key);
  plans.push(normalized);
}

async function fetchSetlistsSearchByPlan(plan: SearchPlan, pageOneBased: number): Promise<SearchResultPayload> {
  const params = new URLSearchParams({ p: String(pageOneBased) });
  if (plan.artistName) params.set("artistName", plan.artistName);
  if (plan.artistMbid) params.set("artistMbid", plan.artistMbid);
  if (plan.venueName) params.set("venueName", plan.venueName);
  if (plan.cityName) params.set("cityName", plan.cityName);
  if (plan.tourName) params.set("tourName", plan.tourName);
  if (plan.year) params.set("year", plan.year);
  if (plan.countryCode) params.set("countryCode", plan.countryCode);

  const response = await fetch(`${BASE_URL}/search/setlists?${params.toString()}`, {
    headers: getHeaders(),
    next: { revalidate: 60 * 60 * 6 }
  });

  if (response.status === 404) {
    return { shows: [], page: pageOneBased, total: 0, itemsPerPage: 0 };
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

async function tryPlansUntilHit(plans: SearchPlan[], pageOneBased: number): Promise<SearchResultPayload | null> {
  for (const plan of plans) {
    const result = await fetchSetlistsSearchByPlan(plan, pageOneBased);
    if (result.shows.length > 0 || result.total > 0) {
      return result;
    }
  }
  return null;
}

function emptyResultFor(pageOneBased: number): SearchResultPayload {
  return { shows: [], page: pageOneBased, total: 0, itemsPerPage: 0 };
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

async function searchUpcomingShowsByVenueFallback(parsed: ParsedSearchTerm): Promise<SearchResultPayload> {
  const venues = await fetchVenueCandidates(parsed);
  if (!venues.length) {
    return emptyResultFor(1);
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

  return emptyResultFor(1);
}

function hasUserFilters(parsed: StructuredQuery, extras: { remaining?: string } = {}) {
  return Boolean(parsed.explicitCity || parsed.year || parsed.countryCode || extras.remaining);
}

async function runExplicitArtistFlow(parsed: StructuredQuery, pageOneBased: number): Promise<SearchResultPayload> {
  const filtered = hasUserFilters(parsed);
  const seen = new Set<string>();
  const plans: SearchPlan[] = [];

  addUniquePlan(plans, seen, {
    artistName: parsed.explicitArtist,
    cityName: parsed.explicitCity || undefined,
    year: parsed.year || undefined,
    countryCode: parsed.countryCode || undefined
  });
  if (parsed.explicitCity && (parsed.year || parsed.countryCode)) {
    addUniquePlan(plans, seen, {
      artistName: parsed.explicitArtist,
      cityName: parsed.explicitCity
    });
  }
  if (!filtered) {
    addUniquePlan(plans, seen, { artistName: parsed.explicitArtist });
  }

  const firstHit = await tryPlansUntilHit(plans, pageOneBased);
  if (firstHit) return firstHit;

  if (pageOneBased > 1) {
    return emptyResultFor(pageOneBased);
  }

  const candidates = await resolveArtistCandidatesFromCore(parsed.explicitArtist);
  for (const resolved of candidates) {
    const primaryPlan: SearchPlan = {
      artistMbid: resolved.mbid,
      cityName: parsed.explicitCity || undefined,
      year: parsed.year || undefined,
      countryCode: parsed.countryCode || undefined
    };
    const primaryResult = await fetchSetlistsSearchByPlan(primaryPlan, pageOneBased);
    if (primaryResult.shows.length > 0 || primaryResult.total > 0) {
      return primaryResult;
    }
  }

  if (candidates.length && parsed.explicitCity && (parsed.year || parsed.countryCode)) {
    const top = candidates[0];
    const relaxedPlan: SearchPlan = {
      artistMbid: top.mbid,
      cityName: parsed.explicitCity
    };
    const relaxedResult = await fetchSetlistsSearchByPlan(relaxedPlan, pageOneBased);
    if (relaxedResult.shows.length > 0 || relaxedResult.total > 0) {
      return relaxedResult;
    }
  }

  if (candidates.length && !filtered) {
    const top = candidates[0];
    const broadPlan: SearchPlan = { artistMbid: top.mbid };
    const broadResult = await fetchSetlistsSearchByPlan(broadPlan, pageOneBased);
    if (broadResult.shows.length > 0 || broadResult.total > 0) {
      return broadResult;
    }
  }

  if (parsed.explicitArtist && parsed.explicitCity) {
    const fallbackArtistName = candidates[0]?.name ?? parsed.explicitArtist;
    const upcoming = await searchUpcomingShowsByVenueFallback({
      artistName: fallbackArtistName,
      cityName: parsed.explicitCity,
      year: parsed.year,
      countryCode: parsed.countryCode,
      remaining: parsed.explicitCity
    });
    if (upcoming.shows.length > 0) return upcoming;
  }

  return emptyResultFor(pageOneBased);
}

async function runFreeFormFlow(parsed: StructuredQuery, pageOneBased: number): Promise<SearchResultPayload> {
  const coreText = parsed.coreText;
  if (!coreText && !parsed.year && !parsed.countryCode) {
    return emptyResultFor(pageOneBased);
  }

  const knownShortcut = coreText ? await findKnownArtistFromPrefixWithDb(coreText) : null;
  if (knownShortcut) {
    const remaining = knownShortcut.remaining;
    const plan: SearchPlan = remaining
      ? {
          artistMbid: knownShortcut.mbid,
          cityName: remaining,
          year: parsed.year || undefined,
          countryCode: parsed.countryCode || undefined
        }
      : {
          artistMbid: knownShortcut.mbid,
          year: parsed.year || undefined,
          countryCode: parsed.countryCode || undefined
        };
    const shortcutResult = await fetchSetlistsSearchByPlan(plan, pageOneBased);
    if (shortcutResult.shows.length > 0 || shortcutResult.total > 0) {
      return shortcutResult;
    }
    if (remaining) {
      const venuePlan: SearchPlan = {
        artistMbid: knownShortcut.mbid,
        venueName: remaining,
        year: parsed.year || undefined,
        countryCode: parsed.countryCode || undefined
      };
      const venueResult = await fetchSetlistsSearchByPlan(venuePlan, pageOneBased);
      if (venueResult.shows.length > 0 || venueResult.total > 0) {
        return venueResult;
      }
    }
    if (pageOneBased > 1) {
      return emptyResultFor(pageOneBased);
    }
  }

  if (coreText) {
    const directPlan: SearchPlan = {
      artistName: coreText,
      year: parsed.year || undefined,
      countryCode: parsed.countryCode || undefined
    };
    const direct = await fetchSetlistsSearchByPlan(directPlan, pageOneBased);
    if (direct.shows.length > 0 || direct.total > 0) {
      return direct;
    }
  }

  if (pageOneBased > 1) {
    return emptyResultFor(pageOneBased);
  }

  if (coreText) {
    const candidates = await resolveArtistCandidatesFromCore(coreText);

    if (candidates.length) {
      const remaining = candidates[0].remaining;

      // If coreText (normalized) is a prefix of the top artist's normalized name, the
      // remaining text is just the tail of an incomplete artist word — not a city/venue.
      // e.g. query "Tame imp", artist "Tame Impala": "tameimpala".startsWith("tameimp") → true
      const coreNorm = normalizeArtistNameForMatch(coreText);
      const topArtistNorm = normalizeArtistNameForMatch(candidates[0].name);
      const effectiveRemaining = remaining && topArtistNorm.startsWith(coreNorm) ? "" : remaining;

      for (const resolved of candidates) {
        const primaryPlan: SearchPlan = effectiveRemaining
          ? {
              artistMbid: resolved.mbid,
              cityName: effectiveRemaining,
              year: parsed.year || undefined,
              countryCode: parsed.countryCode || undefined
            }
          : parsed.year || parsed.countryCode
            ? {
                artistMbid: resolved.mbid,
                year: parsed.year || undefined,
                countryCode: parsed.countryCode || undefined
              }
            : { artistMbid: resolved.mbid };

        const primaryResult = await fetchSetlistsSearchByPlan(primaryPlan, pageOneBased);
        if (primaryResult.shows.length > 0 || primaryResult.total > 0) {
          return primaryResult;
        }
      }

      if (effectiveRemaining) {
        const top = candidates[0];
        const venuePlan: SearchPlan = {
          artistMbid: top.mbid,
          venueName: effectiveRemaining,
          year: parsed.year || undefined,
          countryCode: parsed.countryCode || undefined
        };
        const venueResult = await fetchSetlistsSearchByPlan(venuePlan, pageOneBased);
        if (venueResult.shows.length > 0 || venueResult.total > 0) {
          return venueResult;
        }

        const tourPlan: SearchPlan = {
          artistMbid: top.mbid,
          tourName: effectiveRemaining,
          year: parsed.year || undefined,
          countryCode: parsed.countryCode || undefined
        };
        const tourResult = await fetchSetlistsSearchByPlan(tourPlan, pageOneBased);
        if (tourResult.shows.length > 0 || tourResult.total > 0) {
          return tourResult;
        }

        const upcoming = await searchUpcomingShowsByVenueFallback({
          artistName: top.name,
          cityName: effectiveRemaining,
          year: parsed.year,
          countryCode: parsed.countryCode,
          remaining: effectiveRemaining
        });
        if (upcoming.shows.length > 0) return upcoming;
      }
    }
  }

  if (coreText) {
    const venuePlan: SearchPlan = {
      venueName: coreText,
      year: parsed.year || undefined,
      countryCode: parsed.countryCode || undefined
    };
    const venueResult = await fetchSetlistsSearchByPlan(venuePlan, pageOneBased);
    if (venueResult.shows.length > 0 || venueResult.total > 0) {
      return venueResult;
    }

    const cityPlan: SearchPlan = {
      cityName: coreText,
      year: parsed.year || undefined,
      countryCode: parsed.countryCode || undefined
    };
    const cityResult = await fetchSetlistsSearchByPlan(cityPlan, pageOneBased);
    if (cityResult.shows.length > 0 || cityResult.total > 0) {
      return cityResult;
    }
  }

  return emptyResultFor(pageOneBased);
}

function buildFreeFormFallback(searchTerm: string, parsed: StructuredQuery): StructuredQuery {
  const normalized = normalizeSearchText(searchTerm);
  const { year, remaining: afterYear } = parseYear(normalized);
  const trailingCountry = extractTrailingCountry(afterYear);
  const countryCode = trailingCountry?.countryCode ?? "";
  const coreText = applyArtistAliases((trailingCountry ? trailingCountry.head : afterYear).trim());
  return {
    explicitArtist: "",
    explicitCity: "",
    year: year || parsed.year,
    countryCode: countryCode || parsed.countryCode,
    coreText
  };
}

export async function searchSetlists(searchTerm: string, pageZeroBased = 0): Promise<SearchResultPayload> {
  const incomingPage = Number.isFinite(pageZeroBased) && pageZeroBased >= 0 ? pageZeroBased : 0;
  const pageOneBased = incomingPage + 1;

  const parsed = parseStructuredQuery(searchTerm);

  if (parsed.explicitArtist) {
    const explicit = await runExplicitArtistFlow(parsed, pageOneBased);
    if (explicit.shows.length > 0 || explicit.total > 0) return explicit;
    if (pageOneBased > 1) return explicit;

    const fallback = buildFreeFormFallback(searchTerm, parsed);
    if (fallback.coreText && fallback.coreText !== parsed.explicitArtist) {
      const fallbackResult = await runFreeFormFlow(fallback, pageOneBased);
      if (fallbackResult.shows.length > 0 || fallbackResult.total > 0) return fallbackResult;
    }
    return explicit;
  }

  return runFreeFormFlow(parsed, pageOneBased);
}

export async function getSetlistById(id: string) {
  const response = await fetch(`${BASE_URL}/setlist/${encodeURIComponent(id)}`, {
    headers: getHeaders(),
    cache: "no-store"
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

export async function extractArtistForUpcoming(searchTerm: string): Promise<string> {
  const parsed = parseStructuredQuery(searchTerm);
  if (parsed.explicitArtist) return parsed.explicitArtist;

  const known = findKnownArtistInQuery(parsed.coreText);
  if (known) return known.name;

  // DB lookup resolves partial / DB-only artists ("Tame Imp" → "Tame Impala",
  // "Bogotá Tame Imp" → "Tame Impala"). Without this, the Ticketmaster keyword
  // would be the raw user input, which TM's exact-attraction filter rejects.
  const dbMatch = await lookupArtistInDb(parsed.coreText);
  if (dbMatch) return dbMatch.name;

  const words = parsed.coreText.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 3) return parsed.coreText;

  return "";
}

export function extractYearFromSearchTerm(searchTerm: string): string {
  return parseStructuredQuery(searchTerm).year;
}

export const __testing__ = {
  parseStructuredQuery,
  applyArtistAliases,
  countryNameToCode,
  extractTrailingCountry,
  normalizeSearchText,
  normalizeArtistNameForMatch,
  scoreArtistAgainstPrefix
};
