export type WalletStatus = "going" | "went";

export type ShowRecord = {
  id: string;
  artist: string;
  venue: string;
  city: string;
  country: string;
  eventDateIso: string; // YYYY-MM-DD
  setlistUrl?: string;
  artistMbid?: string;
  venueMbid?: string;
  tourName?: string;
};

export type ShowDetailRecord = ShowRecord & {
  attendees?: number;
  songNames: string[];
  setlistSections: Array<{
    label: string;
    songs: string[];
  }>;
};

type SetlistFmArtist = {
  mbid?: string;
  name?: string;
  sortName?: string;
};

type SetlistFmVenue = {
  id?: string;
  name?: string;
  city?: {
    name?: string;
    state?: string;
    stateCode?: string;
    country?: {
      code?: string;
      name?: string;
    };
  };
};

export type SetlistFmSetlist = {
  id?: string;
  eventDate?: string; // dd-MM-yyyy
  url?: string;
  artist?: SetlistFmArtist;
  venue?: SetlistFmVenue;
  tour?: { name?: string };
  sets?: {
    set?:
      | {
          name?: string;
          encore?: number | string;
          song?: Array<{ name?: string }> | { name?: string };
        }
      | Array<{
          name?: string;
          encore?: number | string;
          song?: Array<{ name?: string }> | { name?: string };
        }>;
  };
  info?: string;
  user?: { userid?: string };
};

type SetlistFmSetEntry = {
  name?: string;
  encore?: number | string;
  song?: Array<{ name?: string }> | { name?: string };
};

function toIsoDate(input?: string) {
  if (!input) return "";
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(input);
  if (!match) return "";
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

function cityLabel(venue?: SetlistFmVenue) {
  const city = venue?.city?.name ?? "";
  const stateCode = venue?.city?.stateCode ?? venue?.city?.state ?? "";
  return [city, stateCode].filter(Boolean).join(", ");
}

function countryLabel(venue?: SetlistFmVenue) {
  return venue?.city?.country?.name ?? venue?.city?.country?.code ?? "";
}

export function mapSetlistToShowRecord(raw: SetlistFmSetlist): ShowRecord | null {
  if (!raw.id) return null;

  const eventDateIso = toIsoDate(raw.eventDate);
  if (!eventDateIso) return null;

  return {
    id: raw.id,
    artist: raw.artist?.name ?? raw.artist?.sortName ?? "Artista",
    venue: raw.venue?.name ?? "Local",
    city: cityLabel(raw.venue),
    country: countryLabel(raw.venue),
    eventDateIso,
    setlistUrl: raw.url,
    artistMbid: raw.artist?.mbid,
    venueMbid: raw.venue?.id,
    tourName: raw.tour?.name
  };
}

function normalizeSetArray(
  input: SetlistFmSetEntry | SetlistFmSetEntry[] | undefined
) {
  if (!input) return [];
  return Array.isArray(input) ? input : [input];
}

function normalizeSongArray(input: Array<{ name?: string }> | { name?: string } | undefined) {
  if (!input) return [];
  return Array.isArray(input) ? input : [input];
}

export function mapSetlistToShowDetailRecord(raw: SetlistFmSetlist): ShowDetailRecord | null {
  const base = mapSetlistToShowRecord(raw);
  if (!base) return null;

  const setlistSections = normalizeSetArray(raw.sets?.set)
    .map((set, index) => {
      const songs = normalizeSongArray(set.song)
        .map((song) => song.name?.trim() ?? "")
        .filter(Boolean);

      if (!songs.length) return null;

      const rawLabel = typeof set.name === "string" && set.name.trim() ? set.name.trim() : "";
      const encoreValue = set.encore;
      const encoreLabel =
        encoreValue !== undefined && encoreValue !== null && String(encoreValue).trim() !== ""
          ? `Encore ${String(encoreValue).trim()}`
          : "";

      const label = rawLabel || encoreLabel || (index === 0 ? "Main Set" : `Set ${index + 1}`);
      return { label, songs };
    })
    .filter((section): section is { label: string; songs: string[] } => Boolean(section));

  const songNames = setlistSections.flatMap((section) => section.songs);

  return {
    ...base,
    songNames,
    setlistSections
  };
}
