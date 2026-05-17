import type { ShowRecord, WalletStatus } from "@/lib/show-types";

export function parseIsoDateAtLocalMidnight(isoDate: string) {
  return new Date(`${isoDate}T00:00:00`);
}

export function isFutureOrTodayShow(eventDateIso: string) {
  const showDate = parseIsoDateAtLocalMidnight(eventDateIso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return showDate >= today;
}

export function deriveWalletStatus(eventDateIso: string): WalletStatus {
  return isFutureOrTodayShow(eventDateIso) ? "going" : "went";
}

export function formatDatePtBrLong(eventDateIso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  })
    .format(parseIsoDateAtLocalMidnight(eventDateIso))
    .replace(".", "")
    .toUpperCase();
}

export function formatVenueLine(show: Pick<ShowRecord, "venue" | "city" | "country">) {
  return [show.venue, show.city, show.country].filter(Boolean).join(", ");
}

export function daysUntilShow(eventDateIso: string) {
  const now = new Date();
  const target = parseIsoDateAtLocalMidnight(eventDateIso);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

const MONTHS_PT_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function formatPostDate(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return `${date.getDate()} ${MONTHS_PT_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

export function yearFromEventDateIso(eventDateIso: string): string {
  return eventDateIso.slice(0, 4);
}

export function groupShowsByYearDesc<T extends { eventDateIso: string }>(items: T[]): Array<{ year: string; items: T[] }> {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const year = yearFromEventDateIso(item.eventDateIso);
    if (!year) continue;
    const list = buckets.get(year);
    if (list) list.push(item);
    else buckets.set(year, [item]);
  }
  return Array.from(buckets.entries())
    .map(([year, list]) => ({
      year,
      items: list.sort((a, b) => (a.eventDateIso > b.eventDateIso ? -1 : 1))
    }))
    .sort((a, b) => (a.year > b.year ? -1 : 1));
}

