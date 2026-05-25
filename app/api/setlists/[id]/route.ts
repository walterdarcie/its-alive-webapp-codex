import { NextResponse } from "next/server";
import { getCacheValue, setCacheValue } from "@/lib/setlist-cache";
import { getSetlistById } from "@/lib/setlist-api";
import { getTicketmasterEventById } from "@/lib/ticketmaster-api";

const DETAIL_TTL_WITH_SETLIST_MS = 1000 * 60 * 60 * 24;
const DETAIL_TTL_EMPTY_SETLIST_MS = 1000 * 60 * 5;

function hasSetlistSongs(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const songNames = (payload as { songNames?: unknown }).songNames;
  return Array.isArray(songNames) && songNames.length > 0;
}

function cacheHeadersFor(payload: unknown, cacheState: "HIT" | "MISS") {
  const sMaxAgeSeconds = hasSetlistSongs(payload) ? 86400 : 300;
  return {
    "Cache-Control": `public, max-age=60, s-maxage=${sMaxAgeSeconds}`,
    "x-cache": cacheState
  };
}

export async function GET(_: Request, context: { params: { id: string } }) {
  const id = context.params.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing setlist id" }, { status: 400 });
  }

  if (id.startsWith("tm-")) {
    const show = await getTicketmasterEventById(id);
    if (!show) {
      return NextResponse.json({ error: "Show not found" }, { status: 404 });
    }
    return NextResponse.json(show, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=3600" }
    });
  }

  const cacheKey = `detail:${id}`;
  const cached = getCacheValue<unknown>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: cacheHeadersFor(cached, "HIT")
    });
  }

  try {
    const payload = await getSetlistById(id);
    const ttlMs = hasSetlistSongs(payload) ? DETAIL_TTL_WITH_SETLIST_MS : DETAIL_TTL_EMPTY_SETLIST_MS;
    setCacheValue(cacheKey, payload, ttlMs);
    return NextResponse.json(payload, {
      headers: cacheHeadersFor(payload, "MISS")
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: "Failed to load setlist", message }, { status: 500 });
  }
}
