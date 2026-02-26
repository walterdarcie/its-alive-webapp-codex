"use client";

import type { ShowRecord, WalletStatus } from "@/lib/show-types";
import { deriveWalletStatus } from "@/lib/show-utils";

const STORAGE_KEY = "its-alive.wallet.v1";

export type WalletEntry = {
  show: ShowRecord;
  savedAt: string;
};

type WalletStoreShape = {
  items: Record<string, WalletEntry>;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStore(): WalletStoreShape {
  if (!canUseStorage()) return { items: {} };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: {} };
    const parsed = JSON.parse(raw) as WalletStoreShape;
    if (!parsed || typeof parsed !== "object" || !parsed.items || typeof parsed.items !== "object") {
      return { items: {} };
    }
    return parsed;
  } catch {
    return { items: {} };
  }
}

function writeStore(store: WalletStoreShape) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getWalletEntries() {
  const store = readStore();
  return Object.values(store.items).sort((a, b) => (a.show.eventDateIso < b.show.eventDateIso ? 1 : -1));
}

export function isSavedInWallet(showId: string) {
  const store = readStore();
  return Boolean(store.items[showId]);
}

export function saveToWallet(show: ShowRecord) {
  const store = readStore();
  store.items[show.id] = {
    show,
    savedAt: new Date().toISOString()
  };
  writeStore(store);
}

export function removeFromWallet(showId: string) {
  const store = readStore();
  delete store.items[showId];
  writeStore(store);
}

export function getWalletStatus(show: ShowRecord): WalletStatus {
  return deriveWalletStatus(show.eventDateIso);
}

export function getWalletShow(showId: string) {
  const store = readStore();
  return store.items[showId]?.show ?? null;
}

