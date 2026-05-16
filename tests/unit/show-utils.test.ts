import { describe, expect, it } from "vitest";
import { daysUntilShow, deriveWalletStatus, formatVenueLine, isFutureOrTodayShow } from "@/lib/show-utils";

function toIso(date: Date) {
  // Use local date components to match parseIsoDateAtLocalMidnight
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

describe("show-utils", () => {
  it("classifies future and past dates for wallet status", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    expect(deriveWalletStatus(toIso(tomorrow))).toBe("going");
    expect(deriveWalletStatus(toIso(yesterday))).toBe("went");
  });

  it("marks today as future-or-today", () => {
    const today = toIso(new Date());
    expect(isFutureOrTodayShow(today)).toBe(true);
  });

  it("formats venue line with non-empty parts only", () => {
    expect(
      formatVenueLine({
        venue: "MorumBIS",
        city: "São Paulo, SP",
        country: "Brasil"
      })
    ).toBe("MorumBIS, São Paulo, SP, Brasil");

    expect(
      formatVenueLine({
        venue: "Kia Forum",
        city: "",
        country: "USA"
      })
    ).toBe("Kia Forum, USA");
  });

  it("returns a finite number of days", () => {
    const target = new Date();
    target.setDate(target.getDate() + 3);
    expect(Number.isFinite(daysUntilShow(toIso(target)))).toBe(true);
  });
});
