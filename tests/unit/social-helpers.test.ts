import { describe, expect, it } from "vitest";
import { formatPtBrNumber } from "@/lib/social-types";
import { deriveActionFromShow, normalizeNameForSearch } from "@/lib/social-utils";
import { groupShowsByYearDesc, yearFromEventDateIso } from "@/lib/show-utils";
import type { ShowRecord } from "@/lib/show-types";

function makeShow(id: string, eventDateIso: string): ShowRecord {
  return {
    id,
    artist: `Artist ${id}`,
    venue: "Venue",
    city: "City",
    country: "Country",
    eventDateIso
  };
}

describe("formatPtBrNumber", () => {
  it("formats with thousands separator in pt-BR", () => {
    expect(formatPtBrNumber(9999999)).toBe("9.999.999");
    expect(formatPtBrNumber(1000)).toBe("1.000");
    expect(formatPtBrNumber(42)).toBe("42");
  });

  it("returns em-dash for zero and invalid input", () => {
    expect(formatPtBrNumber(0)).toBe("—");
    expect(formatPtBrNumber(-1)).toBe("—");
    expect(formatPtBrNumber(Number.NaN)).toBe("—");
    expect(formatPtBrNumber(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("yearFromEventDateIso", () => {
  it("extracts the YYYY prefix", () => {
    expect(yearFromEventDateIso("2025-12-31")).toBe("2025");
    expect(yearFromEventDateIso("1999-01-01")).toBe("1999");
  });
});

describe("groupShowsByYearDesc", () => {
  it("groups shows by year, newest year first, newest show first within each group", () => {
    const shows = [
      makeShow("a", "2023-06-15"),
      makeShow("b", "2025-01-02"),
      makeShow("c", "2025-09-09"),
      makeShow("d", "2024-03-20")
    ];
    const grouped = groupShowsByYearDesc(shows);
    expect(grouped.map((g) => g.year)).toEqual(["2025", "2024", "2023"]);
    expect(grouped[0]?.items.map((s) => s.id)).toEqual(["c", "b"]);
    expect(grouped[1]?.items.map((s) => s.id)).toEqual(["d"]);
    expect(grouped[2]?.items.map((s) => s.id)).toEqual(["a"]);
  });

  it("ignores entries without a parseable year prefix", () => {
    const shows = [makeShow("a", "2024-01-01"), makeShow("b", "")];
    const grouped = groupShowsByYearDesc(shows);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.year).toBe("2024");
  });
});

describe("deriveActionFromShow", () => {
  it("returns 'going' for future shows and 'went' for past shows", () => {
    const today = new Date();
    const future = new Date(today);
    future.setDate(today.getDate() + 5);
    const past = new Date(today);
    past.setDate(today.getDate() - 5);

    const toIso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    expect(deriveActionFromShow(makeShow("a", toIso(future)))).toBe("going");
    expect(deriveActionFromShow(makeShow("b", toIso(past)))).toBe("went");
  });
});

describe("normalizeNameForSearch", () => {
  it("lowercases and strips diacritics", () => {
    expect(normalizeNameForSearch("Walter Dárcie")).toBe("walter darcie");
    expect(normalizeNameForSearch("João Pedro")).toBe("joao pedro");
  });

  it("removes apostrophes and quotes", () => {
    expect(normalizeNameForSearch("Guns N' Roses")).toBe("guns n roses");
  });

  it("collapses runs of whitespace", () => {
    expect(normalizeNameForSearch("  multiple   spaces  ")).toBe("multiple spaces");
  });

  it("returns empty for noise-only inputs", () => {
    expect(normalizeNameForSearch("   ")).toBe("");
    expect(normalizeNameForSearch("@@@")).toBe("");
  });
});
