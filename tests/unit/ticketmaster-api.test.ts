import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchTrendingUpcoming, searchUpcomingByArtist } from "@/lib/ticketmaster-api";

function buildEvent(overrides: {
  id?: string;
  name?: string;
  url?: string;
  localDate?: string;
  statusCode?: string;
  artistName?: string;
  venueName?: string;
  cityName?: string;
  stateCode?: string;
  countryName?: string;
} = {}) {
  return {
    id: overrides.id ?? "tm-event-1",
    name: overrides.name ?? (overrides.artistName ?? "Test Artist"),
    url: overrides.url ?? "https://ticketmaster.com/event/1",
    dates: {
      start: { localDate: overrides.localDate ?? "2026-08-15" },
      status: { code: overrides.statusCode ?? "onsale" }
    },
    _embedded: {
      venues: [
        {
          name: overrides.venueName ?? "Test Arena",
          city: { name: overrides.cityName ?? "São Paulo" },
          state: { name: "São Paulo", stateCode: overrides.stateCode ?? "SP" },
          country: { name: overrides.countryName ?? "Brazil", countryCode: "BR" }
        }
      ],
      attractions: [{ name: overrides.artistName ?? "Test Artist", id: "attr-1" }]
    }
  };
}

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }))
  );
}

describe("searchUpcomingByArtist", () => {
  beforeEach(() => {
    vi.stubEnv("TICKETMASTER_API_KEY", "test-tm-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns empty array when API key is not set", async () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "");
    const result = await searchUpcomingByArtist("Metallica");
    expect(result).toEqual([]);
  });

  it("returns empty array for artist name shorter than 2 chars", async () => {
    const result = await searchUpcomingByArtist("a");
    expect(result).toEqual([]);
  });

  it("maps a Ticketmaster event to ShowRecord correctly", async () => {
    mockFetch(200, { _embedded: { events: [buildEvent({ id: "ev1", artistName: "Iron Maiden" })] } });

    const result = await searchUpcomingByArtist("Iron Maiden");
    expect(result).toHaveLength(1);
    const show = result[0]!;
    expect(show.id).toBe("tm-ev1");
    expect(show.artist).toBe("Iron Maiden");
    expect(show.eventDateIso).toBe("2026-08-15");
    expect(show.venue).toBe("Test Arena");
    expect(show.city).toBe("São Paulo, SP");
    expect(show.ticketUrl).toBe("https://ticketmaster.com/event/1");
  });

  it("sets ticketUrl only when status is 'onsale'", async () => {
    const ARTIST = "Status Check Artist";
    mockFetch(200, {
      _embedded: {
        events: [
          buildEvent({ id: "ev-on", statusCode: "onsale", artistName: ARTIST }),
          buildEvent({ id: "ev-off", statusCode: "offsale", artistName: ARTIST }),
          buildEvent({ id: "ev-can", statusCode: "cancelled", artistName: ARTIST })
        ]
      }
    });

    const result = await searchUpcomingByArtist(ARTIST);
    const onsale = result.find((s) => s.id === "tm-ev-on");
    const offsale = result.find((s) => s.id === "tm-ev-off");
    const cancelled = result.find((s) => s.id === "tm-ev-can");

    expect(onsale?.ticketUrl).toBeDefined();
    expect(offsale?.ticketUrl).toBeUndefined();
    expect(cancelled?.ticketUrl).toBeUndefined();
  });

  it("filters out tribute bands and festivals — only keeps exact attraction matches", async () => {
    const ARTIST = "Tribute Filter Artist";
    const tributeEvent = buildEvent({ id: "ev-tribute", artistName: `A Tribute to ${ARTIST}` });
    const realEvent = buildEvent({ id: "ev-real", artistName: ARTIST });
    mockFetch(200, { _embedded: { events: [tributeEvent, realEvent] } });

    const result = await searchUpcomingByArtist(ARTIST);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("tm-ev-real");
  });

  it("filters out events with no attractions", async () => {
    const ARTIST = "No Attraction Artist";
    const event = buildEvent({ id: "ev-noattr", artistName: ARTIST });
    // @ts-expect-error — intentionally removing attractions to simulate missing field
    delete event._embedded.attractions;
    mockFetch(200, { _embedded: { events: [event] } });

    const result = await searchUpcomingByArtist(ARTIST);
    expect(result).toHaveLength(0);
  });

  it("returns empty array on HTTP error", async () => {
    mockFetch(429, { error: "Rate limit exceeded" });
    const result = await searchUpcomingByArtist("Http Error Artist");
    expect(result).toEqual([]);
  });

  it("returns empty array when _embedded is absent (no results)", async () => {
    mockFetch(200, {});
    const result = await searchUpcomingByArtist("No Embedded Artist");
    expect(result).toEqual([]);
  });

  it("skips events with missing id or missing date", async () => {
    const ARTIST = "Missing Fields Artist";
    const noId = { ...buildEvent({ artistName: ARTIST }), id: undefined };
    const noDate = buildEvent({ id: "ev-nodate", artistName: ARTIST });
    // @ts-expect-error — intentionally removing date
    delete noDate.dates.start.localDate;

    mockFetch(200, { _embedded: { events: [noId, noDate] } });
    const result = await searchUpcomingByArtist(ARTIST);
    expect(result).toHaveLength(0);
  });

  it("prefixes all returned show IDs with 'tm-'", async () => {
    const ARTIST = "Prefix Check Artist";
    mockFetch(200, {
      _embedded: {
        events: [buildEvent({ id: "abc123", artistName: ARTIST }), buildEvent({ id: "def456", artistName: ARTIST })]
      }
    });

    const result = await searchUpcomingByArtist(ARTIST);
    expect(result.every((s) => s.id.startsWith("tm-"))).toBe(true);
  });
});

describe("searchTrendingUpcoming", () => {
  beforeEach(() => {
    vi.stubEnv("TICKETMASTER_API_KEY", "test-tm-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns empty array when API key is missing", async () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "");
    const result = await searchTrendingUpcoming();
    expect(result).toEqual([]);
  });

  it("maps Ticketmaster events into ShowRecord with attraction as artist", async () => {
    mockFetch(200, {
      _embedded: {
        events: [
          buildEvent({ id: "trend-1", artistName: "Trending One" }),
          buildEvent({ id: "trend-2", artistName: "Trending Two" })
        ]
      }
    });

    const result = await searchTrendingUpcoming({ countryCode: "BR-A", size: 12 });
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("tm-trend-1");
    expect(result[0]?.artist).toBe("Trending One");
    expect(result[0]?.country).toBe("Brazil");
  });

  it("skips events without main attraction (no artist headline)", async () => {
    const eventWithoutAttraction = {
      ...buildEvent({ id: "no-attr" }),
      _embedded: {
        venues: [{ name: "Some Venue", city: { name: "São Paulo" }, country: { name: "Brazil" } }],
        attractions: []
      }
    };
    mockFetch(200, {
      _embedded: {
        events: [eventWithoutAttraction, buildEvent({ id: "has-attr", artistName: "Real Band" })]
      }
    });

    const result = await searchTrendingUpcoming({ countryCode: "BR-B", size: 12 });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("tm-has-attr");
  });

  it("deduplicates by Ticketmaster event id", async () => {
    mockFetch(200, {
      _embedded: {
        events: [
          buildEvent({ id: "dup", artistName: "Same" }),
          buildEvent({ id: "dup", artistName: "Same" }),
          buildEvent({ id: "other", artistName: "Other" })
        ]
      }
    });

    const result = await searchTrendingUpcoming({ countryCode: "BR-C", size: 12 });
    expect(result.map((s) => s.id)).toEqual(["tm-dup", "tm-other"]);
  });

  it("returns empty array on HTTP error", async () => {
    mockFetch(500, { error: "Internal server error" });
    const result = await searchTrendingUpcoming({ countryCode: "BR-D", size: 12 });
    expect(result).toEqual([]);
  });
});
