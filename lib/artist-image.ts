import { createHash } from "node:crypto";
import { getCacheValue, setCacheValue } from "@/lib/setlist-cache";

export type ArtistImagePayload = {
  imageUrl: string | null;
  pageUrl: string | null;
  source: "wikipedia" | "wikimedia" | "none";
};

type ResolveArtistImageInput = {
  artistName?: string;
  artistMbid?: string;
};

type MusicBrainzArtistResponse = {
  relations?: Array<{
    type?: string;
    url?: {
      resource?: string;
    };
  }>;
};

type WikipediaSummaryResponse = {
  originalimage?: { source?: string };
  thumbnail?: { source?: string };
  content_urls?: {
    desktop?: {
      page?: string;
    };
  };
};

type WikipediaSearchResponse = {
  query?: {
    search?: Array<{
      title?: string;
    }>;
  };
};

type WikidataEntityDataResponse = {
  entities?: Record<
    string,
    {
      claims?: Record<
        string,
        Array<{
          mainsnak?: {
            datavalue?: {
              value?: unknown;
            };
          };
        }>
      >;
      sitelinks?: Record<
        string,
        {
          title?: string;
        }
      >;
    }
  >;
};

const ARTIST_IMAGE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const WIKIPEDIA_LANGS = ["pt", "en"] as const;
const EMPTY_IMAGE: ArtistImagePayload = { imageUrl: null, pageUrl: null, source: "none" };
const REQUEST_HEADERS = {
  "User-Agent": "its-alive-webapp/1.0 (walter.darcie@yahoo.com.br)"
};

function normalizeText(input?: string) {
  return (input ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function buildCacheKey({ artistName, artistMbid }: ResolveArtistImageInput) {
  const mbid = (artistMbid ?? "").trim().toLowerCase();
  if (mbid) return `artist-image:mbid:${mbid}`;

  const name = normalizeText(artistName);
  if (name) return `artist-image:name:${name}`;

  return "";
}

async function fetchJson<T>(url: string) {
  try {
    const response = await fetch(url, { headers: REQUEST_HEADERS });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function parseWikipediaInfoFromUrl(input: string) {
  try {
    const parsed = new URL(input);
    if (!parsed.hostname.endsWith("wikipedia.org")) return null;

    const lang = parsed.hostname.split(".")[0];
    const titleFromPath = parsed.pathname.split("/wiki/")[1] ?? "";
    const title = decodeURIComponent(titleFromPath).replace(/_/g, " ").trim();
    if (!lang || !title) return null;

    return { lang, title };
  } catch {
    return null;
  }
}

function parseWikidataEntityId(input: string) {
  try {
    const parsed = new URL(input);
    if (!parsed.hostname.endsWith("wikidata.org")) return "";
    const parts = parsed.pathname.split("/").filter(Boolean);
    return /^Q\d+$/.test(parts[parts.length - 1] ?? "") ? (parts[parts.length - 1] as string) : "";
  } catch {
    return "";
  }
}

function buildWikimediaImageUrl(rawFileName: string) {
  const normalized = rawFileName.replace(/ /g, "_").trim();
  if (!normalized) return "";
  const hash = createHash("md5").update(normalized).digest("hex");
  return `https://upload.wikimedia.org/wikipedia/commons/${hash[0]}/${hash.slice(0, 2)}/${encodeURIComponent(normalized)}`;
}

async function resolveFromWikipediaTitle(lang: string, title: string): Promise<ArtistImagePayload | null> {
  const normalizedTitle = title.replace(/ /g, "_").trim();
  if (!normalizedTitle) return null;

  const summary = await fetchJson<WikipediaSummaryResponse>(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(normalizedTitle)}`
  );
  if (!summary) return null;

  const imageUrl = summary.originalimage?.source ?? summary.thumbnail?.source ?? null;
  if (!imageUrl) return null;

  const pageUrl = summary.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(normalizedTitle)}`;
  return { imageUrl, pageUrl, source: "wikipedia" };
}

async function resolveFromWikipediaUrl(url: string) {
  const wikiInfo = parseWikipediaInfoFromUrl(url);
  if (!wikiInfo) return null;
  return resolveFromWikipediaTitle(wikiInfo.lang, wikiInfo.title);
}

async function resolveFromWikidataEntity(entityId: string): Promise<ArtistImagePayload | null> {
  const data = await fetchJson<WikidataEntityDataResponse>(`https://www.wikidata.org/wiki/Special:EntityData/${entityId}.json`);
  if (!data?.entities) return null;

  const entity = data.entities[entityId];
  if (!entity) return null;

  const imageClaim = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  const imageFileName = typeof imageClaim === "string" ? imageClaim : "";
  if (!imageFileName) return null;

  const imageUrl = buildWikimediaImageUrl(imageFileName);
  if (!imageUrl) return null;

  const wikiTitle = entity.sitelinks?.ptwiki?.title ?? entity.sitelinks?.enwiki?.title ?? "";
  const pageUrl = wikiTitle
    ? `https://${entity.sitelinks?.ptwiki?.title ? "pt" : "en"}.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.replace(/ /g, "_"))}`
    : `https://www.wikidata.org/wiki/${entityId}`;

  return { imageUrl, pageUrl, source: "wikimedia" };
}

async function resolveViaMusicBrainz(mbid: string): Promise<ArtistImagePayload | null> {
  const artist = await fetchJson<MusicBrainzArtistResponse>(`https://musicbrainz.org/ws/2/artist/${encodeURIComponent(mbid)}?inc=url-rels&fmt=json`);
  if (!artist?.relations?.length) return null;

  const resources = artist.relations.map((relation) => relation.url?.resource ?? "").filter(Boolean);

  const wikipediaUrl = resources.find((resource) => resource.includes("wikipedia.org/wiki/"));
  if (wikipediaUrl) {
    const fromWiki = await resolveFromWikipediaUrl(wikipediaUrl);
    if (fromWiki) return fromWiki;
  }

  const wikidataUrl = resources.find((resource) => resource.includes("wikidata.org/wiki/Q"));
  if (wikidataUrl) {
    const entityId = parseWikidataEntityId(wikidataUrl);
    if (entityId) {
      const fromWikidata = await resolveFromWikidataEntity(entityId);
      if (fromWikidata) return fromWikidata;
    }
  }

  return null;
}

async function resolveViaWikipediaSearch(artistName: string): Promise<ArtistImagePayload | null> {
  const safeArtistName = artistName.trim();
  if (!safeArtistName) return null;

  for (const lang of WIKIPEDIA_LANGS) {
    const search = await fetchJson<WikipediaSearchResponse>(
      `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&srsearch=${encodeURIComponent(safeArtistName)}`
    );
    const title = search?.query?.search?.[0]?.title?.trim() ?? "";
    if (!title) continue;

    const fromTitle = await resolveFromWikipediaTitle(lang, title);
    if (fromTitle) return fromTitle;
  }

  return null;
}

export async function resolveArtistImage(input: ResolveArtistImageInput): Promise<ArtistImagePayload> {
  const cacheKey = buildCacheKey(input);
  if (!cacheKey) return EMPTY_IMAGE;

  const cached = getCacheValue<ArtistImagePayload>(cacheKey);
  if (cached) return cached;

  let resolved: ArtistImagePayload | null = null;
  const mbid = (input.artistMbid ?? "").trim();

  if (mbid) {
    resolved = await resolveViaMusicBrainz(mbid);
  }

  if (!resolved) {
    resolved = await resolveViaWikipediaSearch(input.artistName ?? "");
  }

  const payload = resolved ?? EMPTY_IMAGE;
  setCacheValue(cacheKey, payload, ARTIST_IMAGE_TTL_MS);
  return payload;
}
