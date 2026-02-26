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

