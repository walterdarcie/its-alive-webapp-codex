import { NextResponse } from "next/server";
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

export async function GET() {
  const { supabase, configError } = await loadAuthContext();
  if (configError || !supabase) return configErrorResponse();

  const todayIso = new Date().toISOString().slice(0, 10);

  const [walletResult, ticketmasterShows] = await Promise.all([
    supabase
      .from("wallet_entries")
      .select("setlist_id, event_date, show_data, status")
      .eq("status", "going")
      .gte("event_date", todayIso)
      .order("event_date", { ascending: true })
      .limit(WALLET_SCAN_LIMIT),
    searchTrendingUpcoming({ countryCode: DEFAULT_COUNTRY_CODE, size: TRENDING_LIMIT })
  ]);

  if (walletResult.error) {
    console.error("[shows/trending] wallet error:", walletResult.error.message);
  }

  // 1. Signal de "em alta" da plataforma: quantos usuários marcaram cada show.
  const buckets = new Map<string, { count: number; show: ShowRecord; eventDate: string }>();
  for (const row of walletResult.data ?? []) {
    const showRecord = row.show_data as ShowRecord;
    const setlistId = row.setlist_id as string;
    if (!showRecord || !setlistId) continue;
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

  const fromWallet: TrendingShow[] = Array.from(buckets.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.eventDate.localeCompare(b.eventDate);
    })
    .map(({ count, show }) => ({ show, attendingCount: count }));

  // 2. Preenche com shows futuros do Ticketmaster (BR) — fonte para destaques
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
    source: fromWallet.length ? "mixed" : "ticketmaster"
  });
}
