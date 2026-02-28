import { describe, expect, it } from "vitest";
import { mapSetlistToShowDetailRecord, mapSetlistToShowRecord, type SetlistFmSetlist } from "@/lib/show-types";

const BASE_SETLIST: SetlistFmSetlist = {
  id: "sl-1",
  eventDate: "29-06-2025",
  url: "https://setlist.fm/example",
  artist: {
    name: "Metallica",
    mbid: "mbid-metallica"
  },
  venue: {
    id: "v1",
    name: "Kia Forum",
    city: {
      name: "Inglewood",
      stateCode: "CA",
      country: {
        code: "US",
        name: "USA"
      }
    }
  },
  sets: {
    set: [
      {
        name: "Main Set",
        song: [{ name: "Creeping Death" }, { name: "Harvester of Sorrow" }]
      },
      {
        encore: 1,
        song: [{ name: "One" }]
      }
    ]
  }
};

describe("show-types mapper", () => {
  it("maps setlist to show record", () => {
    const mapped = mapSetlistToShowRecord(BASE_SETLIST);
    expect(mapped).not.toBeNull();
    expect(mapped?.id).toBe("sl-1");
    expect(mapped?.eventDateIso).toBe("2025-06-29");
    expect(mapped?.artist).toBe("Metallica");
  });

  it("maps setlist detail sections and song names", () => {
    const mapped = mapSetlistToShowDetailRecord(BASE_SETLIST);
    expect(mapped).not.toBeNull();
    expect(mapped?.songNames).toEqual(["Creeping Death", "Harvester of Sorrow", "One"]);
    expect(mapped?.setlistSections).toHaveLength(2);
    expect(mapped?.setlistSections[1]?.label).toBe("Encore 1");
  });

  it("returns null for invalid setlist without id", () => {
    const mapped = mapSetlistToShowRecord({
      ...BASE_SETLIST,
      id: undefined
    });
    expect(mapped).toBeNull();
  });
});
