import type { ShowRecord } from "@/lib/show-types";
import type { FollowActivityAction } from "@/lib/social-types";
import { isFutureOrTodayShow } from "@/lib/show-utils";

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
