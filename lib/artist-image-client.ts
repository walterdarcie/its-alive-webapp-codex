"use client";

import type { ArtistImagePayload } from "@/lib/artist-image";

const EMPTY_IMAGE: ArtistImagePayload = { imageUrl: null, pageUrl: null, source: "none" };
const imageCache = new Map<string, ArtistImagePayload>();
const inflightCache = new Map<string, Promise<ArtistImagePayload>>();

export function buildArtistImageKey(artistName?: string, artistMbid?: string) {
  const mbid = (artistMbid ?? "").trim().toLowerCase();
  if (mbid) return `mbid:${mbid}`;

  const name = (artistName ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  return name ? `name:${name}` : "";
}

export async function fetchArtistImageClient({
  artistName,
  artistMbid
}: {
  artistName?: string;
  artistMbid?: string;
}) {
  const key = buildArtistImageKey(artistName, artistMbid);
  if (!key) return EMPTY_IMAGE;

  const hit = imageCache.get(key);
  if (hit) return hit;

  const inflight = inflightCache.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const params = new URLSearchParams();
      if (artistName) params.set("artist", artistName);
      if (artistMbid) params.set("mbid", artistMbid);

      const response = await fetch(`/api/artist-image?${params.toString()}`);
      if (!response.ok) return EMPTY_IMAGE;

      const payload = (await response.json()) as ArtistImagePayload;
      if (payload?.imageUrl && payload?.source) {
        return payload;
      }
      return EMPTY_IMAGE;
    } catch {
      return EMPTY_IMAGE;
    } finally {
      inflightCache.delete(key);
    }
  })();

  inflightCache.set(key, promise);
  const resolved = await promise;
  imageCache.set(key, resolved);
  return resolved;
}
