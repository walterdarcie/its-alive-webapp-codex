import { describe, expect, it } from "vitest";
import { getCacheValue, setCacheValue } from "@/lib/setlist-cache";

describe("setlist-cache", () => {
  it("returns cached value while entry is valid", () => {
    setCacheValue("cache:test:alive", { ok: true }, 5000);
    expect(getCacheValue<{ ok: boolean }>("cache:test:alive")).toEqual({ ok: true });
  });

  it("expires entries after ttl", async () => {
    setCacheValue("cache:test:ttl", { ok: true }, 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(getCacheValue("cache:test:ttl")).toBeNull();
  });

  it("evicts oldest entries when cache reaches max size", () => {
    for (let index = 0; index < 620; index += 1) {
      setCacheValue(`cache:test:max:${index}`, { index }, 60_000);
    }

    expect(getCacheValue("cache:test:max:0")).toBeNull();
    expect(getCacheValue<{ index: number }>("cache:test:max:619")?.index).toBe(619);
  });
});
