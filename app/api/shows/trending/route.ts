import { NextResponse, type NextRequest } from "next/server";
import type { ShowRecord } from "@/lib/show-types";
import type { TrendingShow } from "@/lib/social-types";
import { searchTrendingUpcoming } from "@/lib/ticketmaster-api";
import { configErrorResponse, loadAuthContext } from "@/lib/supabase/social-helpers";

const TRENDING_LIMIT = 24;
const WALLET_SCAN_LIMIT = 200;
const DEFAULT_COUNTRY_CODE = "BR";

function normalizeArtistKey(artist: string): string {
  return artist
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function normalizeLoose(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

// Maps ISO country codes to keywords that may appear inside `show.country`
// (which is the full country name from Setlist.fm / Ticketmaster).
const COUNTRY_CODE_KEYWORDS: Record<string, string[]> = {
  BR: ["brasil", "brazil"],
  US: ["united states", "estados unidos", "usa"],
  AR: ["argentina"],
  MX: ["mexico", "méxico"],
  CL: ["chile"],
  GB: ["united kingdom", "uk", "england", "inglaterra", "great britain"],
  PT: ["portugal"]
};

function showMatchesCountry(show: ShowRecord, countryCode: string): boolean {
  const target = countryCode.toUpperCase();
  const keywords = COUNTRY_CODE_KEYWORDS[target] ?? [];
  if (!keywords.length) return true;
  const country = normalizeLoose(show.country ?? "");
  if (!country) return false;
  return keywords.some((keyword) => country.includes(keyword));
}

function showMatchesCity(show: ShowRecord, city: string): boolean {
  const target = normalizeLoose(city);
  if (!target) return true;
  const showCity = normalizeLoose(show.city ?? "");
  return showCity.includes(target);
}

export async function GET(request: NextRequest) {
  const { supabase, configError } = await loadAuthContext();
  if (configError || !supabase) return configErrorResponse();

  const url = request.nextUrl;
  const countryCode = (url.searchParams.get("country") ?? DEFAULT_COUNTRY_CODE).toUpperCase();
  const city = url.searchParams.get("city")?.trim() ?? "";
  const genre = url.searchParams.get("genre")?.trim() ?? "";

  const todayIso = new Date().toISOString().slice(0, 10);

  const [walletResult, ticketmasterShows] = await Promise.all([
    supabase
      .from("wallet_entries")
      .select("setlist_id, event_date, show_data, status")
      .eq("status", "going")
      .gte("event_date", todayIso)
      .order("event_date", { ascending: true })
      .limit(WALLET_SCAN_LIMIT),
    searchTrendingUpcoming({ countryCode, size: TRENDING_LIMIT, city, genre })
  ]);

  if (walletResult.error) {
    console.error("[shows/trending] wallet error:", walletResult.error.message);
  }

  // 1. Signal de "em alta" da plataforma. Genre não existe nos dados da wallet,
  //    então quando o usuário escolhe um gênero a fonte é só Ticketmaster.
  const buckets = new Map<string, { count: number; show: ShowRecord; eventDate: string }>();
  if (!genre) {
    for (const row of walletResult.data ?? []) {
      const showRecord = row.show_data as ShowRecord;
      const setlistId = row.setlist_id as string;
      if (!showRecord || !setlistId) continue;
      if (!showMatchesCountry(showRecord, countryCode)) continue;
      if (city && !showMatchesCity(showRecord, city)) continue;
      const existing = buckets.get(setlistId);
      if (existing) {
        existing.count += 1;
      } else {
        buckets.set(setlistId, {
          count: 1,
          show: showRecord,
          eventDate: row.event_date as string
        });
      }
    }
  }

  const fromWallet: TrendingShow[] = Array.from(buckets.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.eventDate.localeCompare(b.eventDate);
    })
    .map(({ count, show }) => ({ show, attendingCount: count }));

  // 2. Preenche com shows futuros do Ticketmaster — fonte para destaques
  //    quando a plataforma ainda não tem volume suficiente. Dedup por id.
  const seenIds = new Set(fromWallet.map((entry) => entry.show.id));
  const fromTicketmaster: TrendingShow[] = ticketmasterShows
    .filter((show) => !seenIds.has(show.id))
    .map((show) => ({ show, attendingCount: 0 }));

  // 3. Deduplica por artista: garante que cada artista aparece no máximo uma vez,
  //    preservando a ordem (plataforma > ticketmaster) e o show mais relevante.
  const seenArtists = new Set<string>();
  const trending: TrendingShow[] = [];
  for (const entry of [...fromWallet, ...fromTicketmaster]) {
    const key = normalizeArtistKey(entry.show.artist);
    if (!key || seenArtists.has(key)) continue;
    seenArtists.add(key);
    trending.push(entry);
    if (trending.length >= TRENDING_LIMIT) break;
  }

  return NextResponse.json({
    shows: trending,
    source: fromWallet.length ? "mixed" : "ticketmaster",
    filters: { country: countryCode, city, genre }
  });
}
