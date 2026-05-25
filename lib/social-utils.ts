import type { ShowRecord } from "@/lib/show-types";
import type { FollowActivityAction } from "@/lib/social-types";
import { isFutureOrTodayShow, yearFromEventDateIso } from "@/lib/show-utils";

export function deriveActionFromShow(show: ShowRecord): FollowActivityAction {
  return isFutureOrTodayShow(show.eventDateIso) ? "going" : "went";
}

export function normalizeNameForSearch(input: string) {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’‘`"']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ShowAttendanceCounts = {
  totalAttended: number;
  attendedThisYear: number;
};

export function countAttendedShows(shows: ShowRecord[]): ShowAttendanceCounts {
  const currentYear = String(new Date().getFullYear());
  let totalAttended = 0;
  let attendedThisYear = 0;

  for (const show of shows) {
    if (!show?.eventDateIso) continue;
    if (isFutureOrTodayShow(show.eventDateIso)) continue;
    totalAttended += 1;
    if (yearFromEventDateIso(show.eventDateIso) === currentYear) {
      attendedThisYear += 1;
    }
  }

  return { totalAttended, attendedThisYear };
}
