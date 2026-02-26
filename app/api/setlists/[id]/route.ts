import { NextResponse } from "next/server";
import { getCacheValue, setCacheValue } from "@/lib/setlist-cache";
import { getSetlistById } from "@/lib/setlist-api";

const DETAIL_TTL_MS = 1000 * 60 * 60 * 24;

export async function GET(_: Request, context: { params: { id: string } }) {
  const id = context.params.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing setlist id" }, { status: 400 });
  }

  const cacheKey = `detail:${id}`;
  const cached = getCacheValue<unknown>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=86400",
        "x-cache": "HIT"
      }
    });
  }

  try {
    const payload = await getSetlistById(id);
    setCacheValue(cacheKey, payload, DETAIL_TTL_MS);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=86400",
        "x-cache": "MISS"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: "Failed to load setlist", message }, { status: 500 });
  }
}

