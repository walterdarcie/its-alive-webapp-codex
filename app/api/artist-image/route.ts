import { NextRequest, NextResponse } from "next/server";
import { resolveArtistImage } from "@/lib/artist-image";

export async function GET(request: NextRequest) {
  const artist = request.nextUrl.searchParams.get("artist")?.trim() ?? "";
  const mbid = request.nextUrl.searchParams.get("mbid")?.trim() ?? "";

  if (!artist && !mbid) {
    return NextResponse.json(
      {
        error: "Missing artist parameters",
        message: "Informe artist ou mbid para buscar imagem."
      },
      { status: 400 }
    );
  }

  try {
    const payload = await resolveArtistImage({
      artistName: artist,
      artistMbid: mbid
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=604800"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json(
      {
        error: "Failed to load artist image",
        message
      },
      { status: 500 }
    );
  }
}
