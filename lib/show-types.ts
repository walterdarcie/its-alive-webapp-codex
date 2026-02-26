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
          song?: Array<{ name?: string }> | { name?: string };
        }
      | Array<{
          song?: Array<{ name?: string }> | { name?: string };
        }>;
  };
  info?: string;
  user?: { userid?: string };
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
  input:
    | { song?: Array<{ name?: string }> | { name?: string } }
    | Array<{ song?: Array<{ name?: string }> | { name?: string } }>
    | undefined
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

  const songNames = normalizeSetArray(raw.sets?.set)
    .flatMap((set) => normalizeSongArray(set.song))
    .map((song) => song.name?.trim() ?? "")
    .filter(Boolean);

  return {
    ...base,
    songNames
  };
}

