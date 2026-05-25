import { createHash } from "node:crypto";
import { getCacheValue, setCacheValue } from "@/lib/setlist-cache";

export type ArtistImagePayload = {
  imageUrl: string | null;
  pageUrl: string | null;
  source: "wikipedia" | "wikimedia" | "deezer" | "none";
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
  type?: string;
  title?: string;
  description?: string;
  extract?: string;
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
      snippet?: string;
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

type WikidataSearchResponse = {
  search?: Array<{
    id?: string;
    label?: string;
    description?: string;
    aliases?: string[];
    match?: { type?: string; text?: string };
  }>;
};

type DeezerSearchResponse = {
  data?: Array<{
    id?: number;
    name?: string;
    picture_xl?: string;
    picture_big?: string;
    picture_medium?: string;
    link?: string;
  }>;
};

const ARTIST_IMAGE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const WIKIPEDIA_LANGS = ["pt", "en"] as const;
const EMPTY_IMAGE: ArtistImagePayload = { imageUrl: null, pageUrl: null, source: "none" };
const REQUEST_HEADERS = {
  "User-Agent": "its-alive-webapp/1.0 (walter.darcie@yahoo.com.br)"
};

function normalizeText(input?: string) {
  // Apóstrofes são removidas — Deezer cataloga "Marky Ramone's Blitzkrieg" como
  // "Marky Ramones Blitzkrieg" e sem isso o match exato (e o titleMatchesArtist)
  // falha em nomes com possessivo.
  return (input ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[‘’‛'`]/g, "")
    .toLowerCase()
    .trim();
}

// Separadores comuns de shows com múltiplos artistas. Quando o nome inteiro
// não casa em nenhuma fonte (ex.: "João Gomes & Mestrinho & Jota.Pê" não
// existe como entrada única no Deezer), tentamos o primeiro artista isolado
// — costuma ser o headliner.
const ARTIST_NAME_SPLIT_REGEX = /\s+(?:&|\+|feat\.?|ft\.?)\s+|\s*,\s*/i;

function splitArtistNames(input?: string): string[] {
  const raw = (input ?? "").trim();
  if (!raw) return [];
  return raw
    .split(ARTIST_NAME_SPLIT_REGEX)
    .map((part) => part.trim())
    .filter(Boolean);
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

type WikipediaTitleResolution = {
  payload: ArtistImagePayload;
  summary: WikipediaSummaryResponse;
};

async function fetchWikipediaSummary(lang: string, title: string): Promise<WikipediaSummaryResponse | null> {
  const normalizedTitle = title.replace(/ /g, "_").trim();
  if (!normalizedTitle) return null;
  return fetchJson<WikipediaSummaryResponse>(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(normalizedTitle)}`
  );
}

async function resolveFromWikipediaTitle(lang: string, title: string): Promise<ArtistImagePayload | null> {
  const result = await resolveFromWikipediaTitleWithSummary(lang, title);
  return result?.payload ?? null;
}

async function resolveFromWikipediaTitleWithSummary(
  lang: string,
  title: string
): Promise<WikipediaTitleResolution | null> {
  const summary = await fetchWikipediaSummary(lang, title);
  if (!summary) return null;
  if (summary.type === "disambiguation") return null;

  const imageUrl = summary.originalimage?.source ?? summary.thumbnail?.source ?? null;
  if (!imageUrl) return null;

  const normalizedTitle = title.replace(/ /g, "_").trim();
  const pageUrl = summary.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(normalizedTitle)}`;
  return { payload: { imageUrl, pageUrl, source: "wikipedia" }, summary };
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

  // 1ª opção: P18 (imagem do Wikidata) — caminho mais curto.
  const imageClaim = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  const imageFileName = typeof imageClaim === "string" ? imageClaim : "";
  if (imageFileName) {
    const imageUrl = buildWikimediaImageUrl(imageFileName);
    if (imageUrl) {
      const wikiTitle = entity.sitelinks?.ptwiki?.title ?? entity.sitelinks?.enwiki?.title ?? "";
      const pageUrl = wikiTitle
        ? `https://${entity.sitelinks?.ptwiki?.title ? "pt" : "en"}.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.replace(/ /g, "_"))}`
        : `https://www.wikidata.org/wiki/${entityId}`;
      return { imageUrl, pageUrl, source: "wikimedia" };
    }
  }

  // 2ª opção: sem P18, mas a entidade tem página na Wikipedia — busca o thumbnail
  // do summary da página, que cobre artistas com Wikipedia mas sem foto no Wikidata.
  const ptTitle = entity.sitelinks?.ptwiki?.title;
  const enTitle = entity.sitelinks?.enwiki?.title;
  const sitelinks: Array<{ lang: "pt" | "en"; title: string }> = [];
  if (ptTitle) sitelinks.push({ lang: "pt", title: ptTitle });
  if (enTitle) sitelinks.push({ lang: "en", title: enTitle });
  for (const { lang, title } of sitelinks) {
    const fromWiki = await resolveFromWikipediaTitle(lang, title);
    if (fromWiki) return fromWiki;
  }

  return null;
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

const MUSIC_KEYWORDS_BY_LANG: Record<string, string[]> = {
  pt: [
    "música", "musical", "musico", "músico", "musicista", "cantor", "cantora",
    "banda", "grupo musical", "duo musical", "compositor", "compositora",
    "guitarrista", "baterista", "instrumentista", "vocalista", "rapper",
    "produtor musical", "produtora musical", "mpb", "samba", "rock", "pop",
    "sertanejo", "forró", "axé", "funk", "trap", "álbum", "discografia",
    "intérprete", "cantautor", "tecladista", "dj", "violonista", "saxofonista"
  ],
  en: [
    "music", "musical", "musician", "singer", "songwriter", "vocalist",
    "guitarist", "bassist", "drummer", "rapper", "composer", "producer",
    "band", "duo", "trio", "rock", "pop", "jazz", "metal", "hip hop",
    "album", "discography", "record label", "frontman", "frontwoman"
  ]
};

function summaryLooksMusical(summary: WikipediaSummaryResponse, lang: string): boolean {
  const text = `${summary.description ?? ""} ${summary.extract ?? ""}`.toLowerCase();
  if (!text.trim()) return false;
  const keywords = MUSIC_KEYWORDS_BY_LANG[lang] ?? MUSIC_KEYWORDS_BY_LANG.en;
  return keywords.some((keyword) => text.includes(keyword));
}

function titleMatchesArtist(title: string, artistName: string): boolean {
  const normalizedTitle = normalizeText(title);
  const normalizedArtist = normalizeText(artistName);
  if (!normalizedTitle || !normalizedArtist) return false;

  // Match cobre: título contém o nome cheio, OU os tokens significativos do
  // artista aparecem todos no título (cobre "Lenine (cantor)" para "Lenine").
  if (normalizedTitle.includes(normalizedArtist)) return true;

  const tokens = normalizedArtist
    .split(/\s+/)
    .filter((token) => token.length >= 3);
  if (!tokens.length) return false;
  return tokens.every((token) => normalizedTitle.includes(token));
}

function buildMusicalSearchQueries(artistName: string, lang: string): string[] {
  const safe = artistName.trim();
  if (!safe) return [];
  if (lang === "pt") {
    return [
      `"${safe}" cantor OR cantora OR banda OR músico`,
      `"${safe}" música brasileira`,
      `${safe} banda música`,
      safe
    ];
  }
  return [
    `"${safe}" singer OR band OR musician`,
    `"${safe}" music`,
    `${safe} band musician`,
    safe
  ];
}

async function resolveViaWikipediaSearch(artistName: string): Promise<ArtistImagePayload | null> {
  const safeArtistName = artistName.trim();
  if (!safeArtistName) return null;

  // 1ª passagem: Wikidata — encontra a entidade certa pela descrição musical
  // antes de cair na Wikipedia. Resolve Lenine vs. Lenin, Chico Chico vs. Chico Xavier.
  const fromWikidata = await resolveViaWikidataSearch(safeArtistName);
  if (fromWikidata) return fromWikidata;

  // 2ª passagem: Wikipedia search com termos musicais. Só aceita se a página
  // realmente cheira a música E o título lembra o nome do artista (corta resultados
  // como "Prêmio Multishow 2022" para o artista "Gilsons").
  for (const lang of WIKIPEDIA_LANGS) {
    const seen = new Set<string>();
    for (const query of buildMusicalSearchQueries(safeArtistName, lang)) {
      const candidates = await fetchSearchTitles(lang, query, 5);
      for (const title of candidates) {
        if (seen.has(title)) continue;
        seen.add(title);
        if (!titleMatchesArtist(title, safeArtistName)) continue;
        const resolved = await resolveFromWikipediaTitleWithSummary(lang, title);
        if (!resolved) continue;
        if (summaryLooksMusical(resolved.summary, lang)) return resolved.payload;
      }
    }
  }

  // Sem fallback permissivo: melhor mostrar o nome do artista do que uma imagem errada.
  return null;
}

async function resolveViaWikidataSearch(artistName: string): Promise<ArtistImagePayload | null> {
  for (const lang of WIKIPEDIA_LANGS) {
    const response = await fetchJson<WikidataSearchResponse>(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&language=${lang}&uselang=${lang}&format=json&type=item&limit=10&search=${encodeURIComponent(artistName)}`
    );
    const hits = response?.search ?? [];
    if (!hits.length) continue;

    const candidates = hits
      .filter((hit) => typeof hit.id === "string" && /^Q\d+$/.test(hit.id))
      .filter((hit) => descriptionLooksMusical(hit.description ?? "", lang));

    for (const hit of candidates) {
      const resolved = await resolveFromWikidataEntity(hit.id as string);
      if (resolved) return resolved;
    }
  }
  return null;
}

function descriptionLooksMusical(description: string, lang: string): boolean {
  if (!description) return false;
  const keywords = MUSIC_KEYWORDS_BY_LANG[lang] ?? MUSIC_KEYWORDS_BY_LANG.en;
  const text = description.toLowerCase();
  return keywords.some((keyword) => text.includes(keyword));
}

// Deezer devolve essa MD5 vazia quando o artista não tem foto cadastrada —
// um placeholder cinza que precisa ser filtrado.
const DEEZER_EMPTY_IMAGE_HASH = "d41d8cd98f00b204e9800998ecf8427e";

async function resolveViaDeezer(artistName: string): Promise<ArtistImagePayload | null> {
  const safe = artistName.trim();
  if (!safe) return null;

  const response = await fetchJson<DeezerSearchResponse>(
    `https://api.deezer.com/search/artist?limit=5&q=${encodeURIComponent(safe)}`
  );
  const hits = response?.data ?? [];
  const normalizedQuery = normalizeText(safe);

  type DeezerHit = NonNullable<DeezerSearchResponse["data"]>[number];
  const exact: DeezerHit[] = [];
  const fuzzy: DeezerHit[] = [];

  // Match exato primeiro (ex.: query "Lenine" prefere o artista chamado "Lenine"
  // a "Lenine Junior"), depois cai pra fuzzy.
  for (const hit of hits) {
    if (!hit?.name) continue;
    if (normalizeText(hit.name) === normalizedQuery) exact.push(hit);
    else if (titleMatchesArtist(hit.name, safe)) fuzzy.push(hit);
  }

  for (const hit of [...exact, ...fuzzy]) {
    const imageUrl = hit.picture_xl ?? hit.picture_big ?? hit.picture_medium ?? "";
    if (!imageUrl) continue;
    if (imageUrl.includes(DEEZER_EMPTY_IMAGE_HASH)) continue;
    return {
      imageUrl,
      pageUrl: hit.link ?? null,
      source: "deezer"
    };
  }
  return null;
}

async function fetchSearchTitles(lang: string, query: string, limit: number): Promise<string[]> {
  const search = await fetchJson<WikipediaSearchResponse>(
    `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srlimit=${limit}&format=json&srsearch=${encodeURIComponent(query)}`
  );
  const items = search?.query?.search ?? [];
  return items
    .map((entry) => (entry.title ?? "").trim())
    .filter((title): title is string => Boolean(title));
}

export async function resolveArtistImage(input: ResolveArtistImageInput): Promise<ArtistImagePayload> {
  const cacheKey = buildCacheKey(input);
  if (!cacheKey) return EMPTY_IMAGE;

  const cached = getCacheValue<ArtistImagePayload>(cacheKey);
  if (cached) return cached;

  let resolved: ArtistImagePayload | null = null;
  const mbid = (input.artistMbid ?? "").trim();
  const artistName = input.artistName ?? "";

  // 1. MusicBrainz — só roda quando o show tem MBID. Devolve a página oficial
  //    do artista na Wikipedia/Wikidata, que é a fonte mais autoritativa.
  if (mbid) {
    resolved = await resolveViaMusicBrainz(mbid);
  }

  // 2. Deezer — uma única requisição, cobertura ampla de música contemporânea
  //    (especialmente Brasil/LatAm), imagem quadrada 1000×1000 sempre consistente
  //    com a moldura dos tickets. Em geral resolve no primeiro hit.
  if (!resolved) {
    resolved = await resolveViaDeezer(artistName);
  }

  // 3. Wikipedia/Wikidata — fallback para o que falta na Deezer (clássicos,
  //    instrumentistas, projetos muito de nicho). Filtra por contexto musical.
  if (!resolved) {
    resolved = await resolveViaWikipediaSearch(artistName);
  }

  // 4. Shows com múltiplos artistas ("João Gomes & Mestrinho & Jota.Pê") raramente
  //    têm entrada única em qualquer fonte. Cai pro primeiro artista isolado, que
  //    costuma ser o headliner e dá um visual coerente pro card.
  if (!resolved) {
    const parts = splitArtistNames(artistName);
    if (parts.length > 1) {
      const headliner = parts[0];
      resolved = await resolveViaDeezer(headliner);
      if (!resolved) resolved = await resolveViaWikipediaSearch(headliner);
    }
  }

  const payload = resolved ?? EMPTY_IMAGE;
  setCacheValue(cacheKey, payload, ARTIST_IMAGE_TTL_MS);
  return payload;
}
