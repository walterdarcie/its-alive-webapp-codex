import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchUpcomingByArtist } from "@/lib/ticketmaster-api";

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
    mockFetch(200, {
      _embedded: {
        events: [
          buildEvent({ id: "ev-on", statusCode: "onsale" }),
          buildEvent({ id: "ev-off", statusCode: "offsale" }),
          buildEvent({ id: "ev-can", statusCode: "cancelled" })
        ]
      }
    });

    const result = await searchUpcomingByArtist("Some Artist");
    const onsale = result.find((s) => s.id === "tm-ev-on");
    const offsale = result.find((s) => s.id === "tm-ev-off");
    const cancelled = result.find((s) => s.id === "tm-ev-can");

    expect(onsale?.ticketUrl).toBeDefined();
    expect(offsale?.ticketUrl).toBeUndefined();
    expect(cancelled?.ticketUrl).toBeUndefined();
  });

  it("falls back to query artist name when attractions is missing", async () => {
    const event = buildEvent({ id: "ev-noattr" });
    // @ts-expect-error — intentionally removing attractions
    delete event._embedded.attractions;
    mockFetch(200, { _embedded: { events: [event] } });

    const result = await searchUpcomingByArtist("Fallback Artist");
    expect(result[0]?.artist).toBe("Fallback Artist");
  });

  it("returns empty array on HTTP error", async () => {
    mockFetch(429, { error: "Rate limit exceeded" });
    const result = await searchUpcomingByArtist("Metallica");
    expect(result).toEqual([]);
  });

  it("returns empty array when _embedded is absent (no results)", async () => {
    mockFetch(200, {});
    const result = await searchUpcomingByArtist("Unknown Artist");
    expect(result).toEqual([]);
  });

  it("skips events with missing id or missing date", async () => {
    const noId = { ...buildEvent(), id: undefined };
    const noDate = buildEvent({ id: "ev-nodate" });
    // @ts-expect-error — intentionally removing date
    delete noDate.dates.start.localDate;

    mockFetch(200, { _embedded: { events: [noId, noDate] } });
    const result = await searchUpcomingByArtist("Test Artist");
    expect(result).toHaveLength(0);
  });

  it("prefixes all returned show IDs with 'tm-'", async () => {
    mockFetch(200, {
      _embedded: {
        events: [buildEvent({ id: "abc123" }), buildEvent({ id: "def456" })]
      }
    });

    const result = await searchUpcomingByArtist("Test Artist");
    expect(result.every((s) => s.id.startsWith("tm-"))).toBe(true);
  });
});
