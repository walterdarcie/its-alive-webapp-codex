import { NextRequest, NextResponse } from "next/server";
import { getCacheValue, setCacheValue } from "@/lib/setlist-cache";
import {
  searchSetlists,
  SetlistApiError,
  extractArtistForUpcoming,
  extractYearFromSearchTerm
} from "@/lib/setlist-api";
import { searchUpcomingByArtist } from "@/lib/ticketmaster-api";
import type { ShowRecord } from "@/lib/show-types";

const SEARCH_TTL_MS = 1000 * 60 * 60 * 6;

export async function GET(request: NextRequest) {
  const searchTerm = request.nextUrl.searchParams.get("searchTerm")?.trim() ?? "";
  const pageParam = request.nextUrl.searchParams.get("p") ?? "0";
  const page = Number.parseInt(pageParam, 10);
  const pageNum = Number.isNaN(page) ? 0 : page;

  if (!searchTerm || searchTerm.length < 2) {
    return NextResponse.json({ error: "searchTerm must have at least 2 characters" }, { status: 400 });
  }

  const cacheKey = `search:${searchTerm.toLowerCase()}:${pageNum}`;
  const cached = getCacheValue<unknown>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=21600",
        "x-cache": "HIT"
      }
    });
  }

  try {
    if (pageNum === 0) {
      const artistName = extractArtistForUpcoming(searchTerm);
      const yearFilter = extractYearFromSearchTerm(searchTerm);
      // Ticketmaster só retorna shows futuros. Se o usuário pediu um ano no passado,
      // o merge polui o ranking (futuros sobem antes dos passados) e a busca por ano
      // some na prática. Pulamos a chamada nesse caso e filtramos por ano quando o
      // ano pedido é o atual ou futuro.
      const currentYear = new Date().getUTCFullYear();
      const yearAllowsUpcoming = !yearFilter || Number(yearFilter) >= currentYear;
      const shouldFetchUpcoming = Boolean(artistName) && yearAllowsUpcoming;

      const [setlistPayload, upcomingShowsRaw] = await Promise.all([
        searchSetlists(searchTerm, 0),
        shouldFetchUpcoming ? searchUpcomingByArtist(artistName) : Promise.resolve([] as ShowRecord[])
      ]);

      const upcomingShows = yearFilter
        ? upcomingShowsRaw.filter((show) => show.eventDateIso.startsWith(yearFilter))
        : upcomingShowsRaw;

      // Merge: setlist.fm past shows + Ticketmaster upcoming shows, dedup by ID
      const merged = new Map<string, ShowRecord>();
      for (const show of setlistPayload.shows) merged.set(show.id, show);
      for (const show of upcomingShows) {
        if (!merged.has(show.id)) merged.set(show.id, show);
      }

      const payload = {
        ...setlistPayload,
        shows: Array.from(merged.values()),
        total: setlistPayload.total + upcomingShows.length
      };

      setCacheValue(cacheKey, payload, SEARCH_TTL_MS);
      return NextResponse.json(payload, {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=21600",
          "x-cache": "MISS"
        }
      });
    }

    // Pages > 0: only setlist.fm (Ticketmaster upcoming already included in page 0)
    const payload = await searchSetlists(searchTerm, pageNum);
    setCacheValue(cacheKey, payload, SEARCH_TTL_MS);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=21600",
        "x-cache": "MISS"
      }
    });
  } catch (error) {
    if (error instanceof SetlistApiError) {
      if (error.status === 429) {
        return NextResponse.json(
          {
            error: "Busca temporariamente limitada",
            message: "Muitas buscas em sequência. Aguarde alguns segundos e tente novamente."
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        {
          error: "Falha ao buscar shows",
          message: "Não foi possível buscar agora. Tente outra combinação (artista, cidade, país, ano)."
        },
        { status: 502 }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json(
      {
        error: "Falha ao buscar shows",
        message: "Erro interno temporário ao consultar a busca.",
        details: message
      },
      { status: 500 }
    );
  }
}
