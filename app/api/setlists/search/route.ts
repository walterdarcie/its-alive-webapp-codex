import { NextRequest, NextResponse } from "next/server";
import { getCacheValue, setCacheValue } from "@/lib/setlist-cache";
import { searchSetlists, SetlistApiError } from "@/lib/setlist-api";

const SEARCH_TTL_MS = 1000 * 60 * 60 * 6;

export async function GET(request: NextRequest) {
  const searchTerm = request.nextUrl.searchParams.get("searchTerm")?.trim() ?? "";
  const pageParam = request.nextUrl.searchParams.get("p") ?? "0";
  const page = Number.parseInt(pageParam, 10);

  if (!searchTerm || searchTerm.length < 2) {
    return NextResponse.json({ error: "searchTerm must have at least 2 characters" }, { status: 400 });
  }

  const cacheKey = `search:${searchTerm.toLowerCase()}:${Number.isNaN(page) ? 0 : page}`;
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
    const payload = await searchSetlists(searchTerm, Number.isNaN(page) ? 0 : page);
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
