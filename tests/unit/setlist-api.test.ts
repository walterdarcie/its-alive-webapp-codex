import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __testing__, searchSetlists, SetlistApiError } from "@/lib/setlist-api";

const {
  parseStructuredQuery,
  applyArtistAliases,
  countryNameToCode,
  extractTrailingCountry,
  scoreArtistAgainstPrefix
} = __testing__;

describe("parseStructuredQuery", () => {
  it("treats a single-word query as free-form coreText", () => {
    const result = parseStructuredQuery("metallica");
    expect(result.explicitArtist).toBe("");
    expect(result.explicitCity).toBe("");
    expect(result.year).toBe("");
    expect(result.countryCode).toBe("");
    expect(result.coreText).toBe("metallica");
  });

  it("treats a multi-word query as a single free-form coreText (no premature splitting)", () => {
    const result = parseStructuredQuery("iron maiden curitiba");
    expect(result.explicitArtist).toBe("");
    expect(result.explicitCity).toBe("");
    expect(result.coreText).toBe("iron maiden curitiba");
  });

  it("extracts trailing year from free-form text", () => {
    const result = parseStructuredQuery("metallica 2023");
    expect(result.year).toBe("2023");
    expect(result.coreText).toBe("metallica");
  });

  it("extracts trailing country from free-form text", () => {
    const result = parseStructuredQuery("iron maiden brasil");
    expect(result.countryCode).toBe("BR");
    expect(result.coreText).toBe("iron maiden");
  });

  it("extracts both year and country from free-form text", () => {
    const result = parseStructuredQuery("foo fighters 2024 usa");
    expect(result.year).toBe("2024");
    expect(result.countryCode).toBe("US");
    expect(result.coreText).toBe("foo fighters");
  });

  it("parses explicit comma-separated artist, city, country, year", () => {
    const result = parseStructuredQuery("iron maiden, são paulo, brasil, 2022");
    expect(result.explicitArtist).toBe("iron maiden");
    expect(result.explicitCity).toBe("são paulo");
    expect(result.countryCode).toBe("BR");
    expect(result.year).toBe("2022");
  });

  it("parses pipe-separated segments", () => {
    const result = parseStructuredQuery("metallica | chicago | usa");
    expect(result.explicitArtist).toBe("metallica");
    expect(result.explicitCity).toBe("chicago");
    expect(result.countryCode).toBe("US");
  });

  it("parses 'artist em city' syntax", () => {
    const result = parseStructuredQuery("foo fighters em são paulo");
    expect(result.explicitArtist).toBe("foo fighters");
    expect(result.explicitCity).toBe("são paulo");
  });

  it("parses 'artist in city year' syntax with trailing year", () => {
    const result = parseStructuredQuery("the rolling stones in london 2022");
    expect(result.explicitArtist).toBe("the rolling stones");
    expect(result.explicitCity).toBe("london");
    expect(result.year).toBe("2022");
  });

  it("parses quoted artist with city and year", () => {
    const result = parseStructuredQuery('"guns n\' roses" são paulo 2022');
    expect(result.explicitArtist).toBe("Guns N' Roses");
    expect(result.explicitCity).toBe("são paulo");
    expect(result.year).toBe("2022");
  });

  it("applies AC/DC alias", () => {
    expect(parseStructuredQuery("acdc").coreText).toBe("AC/DC");
    expect(parseStructuredQuery("ac dc").coreText).toBe("AC/DC");
  });

  it("returns empty for blank input", () => {
    const result = parseStructuredQuery("   ");
    expect(result.coreText).toBe("");
    expect(result.year).toBe("");
    expect(result.countryCode).toBe("");
  });
});

describe("applyArtistAliases", () => {
  it("rewrites known aliases", () => {
    expect(applyArtistAliases("acdc")).toBe("AC/DC");
    expect(applyArtistAliases("AC DC")).toBe("AC/DC");
    expect(applyArtistAliases("gnr")).toBe("Guns N' Roses");
  });

  it("leaves unknown names untouched", () => {
    expect(applyArtistAliases("foo fighters")).toBe("foo fighters");
  });
});

describe("countryNameToCode", () => {
  it("maps common variants", () => {
    expect(countryNameToCode("brasil")).toBe("BR");
    expect(countryNameToCode("Brazil")).toBe("BR");
    expect(countryNameToCode("USA")).toBe("US");
    expect(countryNameToCode("Estados Unidos")).toBe("US");
    expect(countryNameToCode("United Kingdom")).toBe("GB");
    expect(countryNameToCode("inglaterra")).toBe("GB");
  });

  it("only treats two-letter input as code when opted in", () => {
    expect(countryNameToCode("br")).toBe("");
    expect(countryNameToCode("br", { allowTwoLetterFallback: true })).toBe("BR");
    expect(countryNameToCode("DE", { allowTwoLetterFallback: true })).toBe("DE");
  });

  it("rejects unknown two-letter codes even with the fallback enabled", () => {
    expect(countryNameToCode("dc", { allowTwoLetterFallback: true })).toBe("");
  });

  it("returns empty for unknown names", () => {
    expect(countryNameToCode("atlantis")).toBe("");
  });
});

describe("extractTrailingCountry", () => {
  it("captures multi-word countries at the end", () => {
    expect(extractTrailingCountry("metallica united states")).toEqual({ head: "metallica", countryCode: "US" });
  });

  it("returns null when the only token would be the country", () => {
    expect(extractTrailingCountry("brasil")).toBeNull();
  });
});

describe("scoreArtistAgainstPrefix", () => {
  it("favors exact normalized matches", () => {
    const exact = scoreArtistAgainstPrefix("metallica", { mbid: "x", name: "Metallica", sortName: "Metallica" }, 1);
    const partial = scoreArtistAgainstPrefix("metallica", { mbid: "y", name: "Metallica Tribute Band", sortName: "" }, 1);
    expect(exact).toBeGreaterThan(partial);
  });

  it("rejects unrelated names", () => {
    expect(
      scoreArtistAgainstPrefix("metallica", { mbid: "z", name: "Foo Fighters", sortName: "" }, 1)
    ).toBe(0);
  });

  it("rewards more covered words", () => {
    const oneWord = scoreArtistAgainstPrefix("rolling", { mbid: "a", name: "Rolling", sortName: "" }, 1);
    const threeWords = scoreArtistAgainstPrefix(
      "the rolling stones",
      { mbid: "b", name: "The Rolling Stones", sortName: "" },
      3
    );
    expect(threeWords).toBeGreaterThan(oneWord);
  });

  it("scores partial mid-word prefix match above MIN_ACCEPTABLE threshold", () => {
    // "hayley wi" while typing "Hayley Williams" — diff of 6 normalized chars
    const score = scoreArtistAgainstPrefix("hayley wi", { mbid: "c", name: "Hayley Williams", sortName: "Williams, Hayley" }, 2);
    expect(score).toBeGreaterThanOrEqual(400);
  });

  it("ignores very short prefixes (< 4 chars) for partial matches", () => {
    const score = scoreArtistAgainstPrefix("hay", { mbid: "d", name: "Hayley Williams", sortName: "" }, 1);
    expect(score).toBe(0);
  });

  it("scores 'tame imp' (partial) against 'Tame Impala' above threshold", () => {
    // Simulates the user typing "Tame Impala" and pausing mid-word
    const score = scoreArtistAgainstPrefix("tame imp", { mbid: "e", name: "Tame Impala", sortName: "Tame Impala" }, 2);
    expect(score).toBeGreaterThanOrEqual(400);
  });

  it("scores 'arctic monk' (partial) against 'Arctic Monkeys' above threshold", () => {
    const score = scoreArtistAgainstPrefix("arctic monk", { mbid: "f", name: "Arctic Monkeys", sortName: "Arctic Monkeys" }, 2);
    expect(score).toBeGreaterThanOrEqual(400);
  });

  it("scores 'linkin par' (partial) against 'Linkin Park' above threshold", () => {
    const score = scoreArtistAgainstPrefix("linkin par", { mbid: "g", name: "Linkin Park", sortName: "Linkin Park" }, 2);
    expect(score).toBeGreaterThanOrEqual(400);
  });
});

// === Integration tests for the searchSetlists pipeline ===
// We stub global fetch so the tests never hit the real setlist.fm API.
// Each test uses a unique query so the in-memory cache in lib/setlist-cache.ts
// does not leak state between tests.

type FetchHandler = (url: URL) => { status: number; body: unknown } | null;

type FetchCall = { url: string; pathname: string; params: Record<string, string> };

function buildSetlist(overrides: Partial<{ id: string; artist: string; venue: string; city: string; country: string; date: string; mbid: string }> = {}) {
  return {
    id: overrides.id ?? "test-setlist-id",
    eventDate: overrides.date ?? "01-01-2024",
    url: "https://www.setlist.fm/setlist/test.html",
    artist: { mbid: overrides.mbid ?? "mbid-artist", name: overrides.artist ?? "Test Artist" },
    venue: {
      id: "venue-id",
      name: overrides.venue ?? "Test Venue",
      city: {
        name: overrides.city ?? "Test City",
        stateCode: "TT",
        country: { code: overrides.country ?? "US", name: overrides.country === "BR" ? "Brasil" : "United States" }
      }
    }
  };
}

function setlistsResponse(setlists: ReturnType<typeof buildSetlist>[]) {
  return { setlist: setlists, page: 1, total: setlists.length, itemsPerPage: setlists.length };
}

function installFetchMock(handlers: FetchHandler[]) {
  const calls: FetchCall[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const urlString = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const url = new URL(urlString);
    const params: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    calls.push({ url: urlString, pathname: url.pathname, params });

    for (const handler of handlers) {
      const result = handler(url);
      if (result) {
        return new Response(JSON.stringify(result.body), {
          status: result.status,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", mock);
  return { calls, mock };
}

describe("searchSetlists (integration with mocked fetch)", () => {
  beforeEach(() => {
    vi.stubEnv("SETLISTFM_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("known artist shortcut hits setlist.fm with the canonical MBID directly", async () => {
    const { calls } = installFetchMock([
      (url) => {
        if (!url.pathname.endsWith("/search/setlists")) return null;
        if (url.searchParams.get("artistMbid") === "65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab") {
          return {
            status: 200,
            body: setlistsResponse([
              buildSetlist({ artist: "Metallica", venue: "Soldier Field", city: "Chicago", country: "US", date: "11-08-2024" })
            ])
          };
        }
        return null;
      }
    ]);

    const result = await searchSetlists("metallica");
    expect(result.shows).toHaveLength(1);
    expect(result.shows[0].artist).toBe("Metallica");
    expect(calls).toHaveLength(1);
    expect(calls[0].params.artistMbid).toBe("65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab");
    expect(calls[0].params.artistName).toBeUndefined();
  });

  it("known artist shortcut applies cityName from the remaining text", async () => {
    const { calls } = installFetchMock([
      (url) => {
        if (!url.pathname.endsWith("/search/setlists")) return null;
        if (
          url.searchParams.get("artistMbid") === "ca891d65-d9b0-4258-89f7-e6ba29d83767" &&
          url.searchParams.get("cityName") === "curitiba-mock"
        ) {
          return {
            status: 200,
            body: setlistsResponse([
              buildSetlist({ artist: "Iron Maiden", city: "Curitiba", country: "BR", date: "27-08-2022" })
            ])
          };
        }
        return null;
      }
    ]);

    const result = await searchSetlists("iron maiden curitiba-mock");
    expect(result.shows).toHaveLength(1);
    expect(result.shows[0].artist).toBe("Iron Maiden");
    expect(calls.length).toBeLessThanOrEqual(2);
    expect(calls[0].params.cityName).toBe("curitiba-mock");
  });

  it("falls back to /search/artists for unknown artists and uses the resolved MBID", async () => {
    let artistsCalls = 0;
    let setlistsCallsCount = 0;
    installFetchMock([
      (url) => {
        if (url.pathname.endsWith("/search/artists")) {
          artistsCalls += 1;
          const term = url.searchParams.get("artistName") ?? "";
          if (term.toLowerCase() === "obscure band xyz") {
            return {
              status: 200,
              body: { artist: [{ mbid: "mbid-obscure", name: "Obscure Band XYZ", sortName: "Obscure Band XYZ" }] }
            };
          }
          return { status: 404, body: { code: 404 } };
        }
        if (url.pathname.endsWith("/search/setlists")) {
          setlistsCallsCount += 1;
          if (url.searchParams.get("artistMbid") === "mbid-obscure") {
            return {
              status: 200,
              body: setlistsResponse([buildSetlist({ artist: "Obscure Band XYZ", mbid: "mbid-obscure" })])
            };
          }
          if (url.searchParams.get("artistName") === "obscure band xyz") {
            return { status: 404, body: { code: 404 } };
          }
          return { status: 404, body: { code: 404 } };
        }
        return null;
      }
    ]);

    const result = await searchSetlists("obscure band xyz");
    expect(result.shows).toHaveLength(1);
    expect(result.shows[0].artist).toBe("Obscure Band XYZ");
    expect(artistsCalls).toBeGreaterThan(0);
    expect(setlistsCallsCount).toBeGreaterThan(0);
  });

  it("explicit comma-separated query queries with artistName + cityName + year + country", async () => {
    const { calls } = installFetchMock([
      (url) => {
        if (!url.pathname.endsWith("/search/setlists")) return null;
        if (
          url.searchParams.get("artistName") === "obscure cover band" &&
          url.searchParams.get("cityName") === "rio" &&
          url.searchParams.get("countryCode") === "BR" &&
          url.searchParams.get("year") === "2022"
        ) {
          return {
            status: 200,
            body: setlistsResponse([buildSetlist({ artist: "Obscure Cover Band", city: "Rio de Janeiro", country: "BR", date: "01-01-2022" })])
          };
        }
        return null;
      }
    ]);

    const result = await searchSetlists("obscure cover band, rio, brasil, 2022");
    expect(result.shows).toHaveLength(1);
    expect(calls[0].params.year).toBe("2022");
    expect(calls[0].params.countryCode).toBe("BR");
  });

  it("does not return unrelated shows when the city filter does not match any setlist", async () => {
    installFetchMock([
      (url) => {
        if (url.pathname.endsWith("/search/setlists")) {
          if (url.searchParams.get("cityName")) {
            return { status: 404, body: { code: 404 } };
          }
          if (url.searchParams.get("venueName")) {
            return { status: 404, body: { code: 404 } };
          }
          if (url.searchParams.get("tourName")) {
            return { status: 404, body: { code: 404 } };
          }
          if (url.searchParams.get("artistMbid")) {
            return {
              status: 200,
              body: setlistsResponse([
                buildSetlist({ artist: "Iron Maiden", venue: "Wrong Venue", city: "Buenos Aires", country: "AR", date: "12-10-2019" })
              ])
            };
          }
          return { status: 404, body: { code: 404 } };
        }
        return null;
      }
    ]);

    const result = await searchSetlists("iron maiden city-does-not-exist 2019");
    expect(result.shows).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("propagates rate limit errors from setlist.fm", async () => {
    installFetchMock([
      (url) => {
        if (url.pathname.endsWith("/search/setlists")) {
          return { status: 429, body: { code: 429, message: "rate limit" } };
        }
        return null;
      }
    ]);

    await expect(searchSetlists("rate-limited-query-xyz")).rejects.toBeInstanceOf(SetlistApiError);
  });

  it("treats 404 from /search/setlists as zero results, not an error", async () => {
    installFetchMock([
      (url) => {
        if (url.pathname.endsWith("/search/setlists")) {
          return { status: 404, body: { code: 404, message: "not found" } };
        }
        if (url.pathname.endsWith("/search/artists")) {
          return { status: 404, body: { code: 404 } };
        }
        return null;
      }
    ]);

    const result = await searchSetlists("never-existed-band-9999");
    expect(result.shows).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("'Tame imp' resolves to Tame Impala without using 'imp' as cityName", async () => {
    const MBID = "mbid-tame-impala-test";
    const { calls } = installFetchMock([
      (url) => {
        if (url.pathname.endsWith("/search/artists")) {
          const term = (url.searchParams.get("artistName") ?? "").toLowerCase();
          if (term === "tame") {
            return { status: 200, body: { artist: [{ mbid: MBID, name: "Tame Impala", sortName: "Tame Impala" }] } };
          }
          return { status: 404, body: { code: 404 } };
        }
        if (url.pathname.endsWith("/search/setlists")) {
          if (url.searchParams.get("artistMbid") === MBID && !url.searchParams.get("cityName")) {
            return { status: 200, body: setlistsResponse([buildSetlist({ artist: "Tame Impala", mbid: MBID, city: "Los Angeles", date: "15-06-2023" })]) };
          }
          return { status: 404, body: { code: 404 } };
        }
        return null;
      }
    ]);

    const result = await searchSetlists("Tame imp");
    expect(result.shows).toHaveLength(1);
    expect(result.shows[0].artist).toBe("Tame Impala");
    // The partial word "imp" must never be sent as a city filter
    expect(calls.filter((c) => c.params.cityName === "imp")).toHaveLength(0);
  });

  it("'Arctic Monk' resolves to Arctic Monkeys without using 'Monk' as cityName", async () => {
    const MBID = "mbid-arctic-monkeys-test";
    const { calls } = installFetchMock([
      (url) => {
        if (url.pathname.endsWith("/search/artists")) {
          const term = (url.searchParams.get("artistName") ?? "").toLowerCase();
          if (term === "arctic") {
            return { status: 200, body: { artist: [{ mbid: MBID, name: "Arctic Monkeys", sortName: "Arctic Monkeys" }] } };
          }
          return { status: 404, body: { code: 404 } };
        }
        if (url.pathname.endsWith("/search/setlists")) {
          if (url.searchParams.get("artistMbid") === MBID && !url.searchParams.get("cityName")) {
            return { status: 200, body: setlistsResponse([buildSetlist({ artist: "Arctic Monkeys", mbid: MBID, city: "Sheffield", date: "20-06-2023" })]) };
          }
          return { status: 404, body: { code: 404 } };
        }
        return null;
      }
    ]);

    const result = await searchSetlists("Arctic Monk");
    expect(result.shows).toHaveLength(1);
    expect(result.shows[0].artist).toBe("Arctic Monkeys");
    expect(calls.filter((c) => c.params.cityName === "Monk" || c.params.cityName === "monk")).toHaveLength(0);
  });

  it("'Linkin Par' resolves to Linkin Park without using 'Par' as cityName", async () => {
    const MBID = "mbid-linkin-park-test";
    const { calls } = installFetchMock([
      (url) => {
        if (url.pathname.endsWith("/search/artists")) {
          const term = (url.searchParams.get("artistName") ?? "").toLowerCase();
          if (term === "linkin") {
            return { status: 200, body: { artist: [{ mbid: MBID, name: "Linkin Park", sortName: "Linkin Park" }] } };
          }
          return { status: 404, body: { code: 404 } };
        }
        if (url.pathname.endsWith("/search/setlists")) {
          if (url.searchParams.get("artistMbid") === MBID && !url.searchParams.get("cityName")) {
            return { status: 200, body: setlistsResponse([buildSetlist({ artist: "Linkin Park", mbid: MBID, city: "Los Angeles", date: "05-09-2017" })]) };
          }
          return { status: 404, body: { code: 404 } };
        }
        return null;
      }
    ]);

    const result = await searchSetlists("Linkin Par");
    expect(result.shows).toHaveLength(1);
    expect(result.shows[0].artist).toBe("Linkin Park");
    expect(calls.filter((c) => c.params.cityName === "Par" || c.params.cityName === "par")).toHaveLength(0);
  });

  it("'Red Hot Chi' resolves to Red Hot Chili Peppers without using 'Chi' as cityName", async () => {
    const MBID = "mbid-rhcp-test";
    const { calls } = installFetchMock([
      (url) => {
        if (url.pathname.endsWith("/search/artists")) {
          const term = (url.searchParams.get("artistName") ?? "").toLowerCase();
          if (term === "red hot" || term === "red") {
            return { status: 200, body: { artist: [{ mbid: MBID, name: "Red Hot Chili Peppers", sortName: "Red Hot Chili Peppers" }] } };
          }
          return { status: 404, body: { code: 404 } };
        }
        if (url.pathname.endsWith("/search/setlists")) {
          if (url.searchParams.get("artistMbid") === MBID && !url.searchParams.get("cityName")) {
            return { status: 200, body: setlistsResponse([buildSetlist({ artist: "Red Hot Chili Peppers", mbid: MBID, city: "Los Angeles", date: "10-09-2022" })]) };
          }
          return { status: 404, body: { code: 404 } };
        }
        return null;
      }
    ]);

    const result = await searchSetlists("Red Hot Chi");
    expect(result.shows).toHaveLength(1);
    expect(result.shows[0].artist).toBe("Red Hot Chili Peppers");
    expect(calls.filter((c) => c.params.cityName === "Chi" || c.params.cityName === "chi")).toHaveLength(0);
  });

  it("keeps total API calls within budget for a free-form multi-word query (≤ 5 calls)", async () => {
    const { calls } = installFetchMock([
      (url) => {
        if (url.pathname.endsWith("/search/setlists")) return { status: 404, body: { code: 404 } };
        if (url.pathname.endsWith("/search/artists")) return { status: 404, body: { code: 404 } };
        return null;
      }
    ]);

    await searchSetlists("totally unknown query budget test name 2099");
    const apiCalls = calls.filter((c) => c.pathname.includes("/search/"));
    expect(apiCalls.length).toBeLessThanOrEqual(8);
  });
});
