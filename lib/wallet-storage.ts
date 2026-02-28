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

function normalizeServerWalletPayload(payload: unknown): WalletStoreShape | null {
  if (!payload || typeof payload !== "object") return null;
  if (!("items" in payload) || !Array.isArray((payload as { items?: unknown }).items)) return null;

  const items = (payload as { items: Array<{ show?: ShowRecord; savedAt?: string }> }).items;
  const normalized: WalletStoreShape = { items: {} };

  for (const item of items) {
    if (!item?.show?.id || !item?.show?.eventDateIso) continue;
    normalized.items[item.show.id] = {
      show: item.show,
      savedAt: item.savedAt ?? new Date().toISOString()
    };
  }

  return normalized;
}

function emitWalletChangedEvent() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("storage"));
}

async function requestWalletServer(input: { method: "GET" | "POST" | "DELETE"; show?: ShowRecord; showId?: string }) {
  let url = "/api/wallet";
  if (input.method === "DELETE" && input.showId) {
    url = `/api/wallet?showId=${encodeURIComponent(input.showId)}`;
  }

  const response = await fetch(url, {
    method: input.method,
    headers: {
      "Content-Type": "application/json"
    },
    body: input.method === "POST" ? JSON.stringify({ show: input.show }) : undefined
  });

  if (!response.ok) {
    throw new Error("Falha ao sincronizar carteira no servidor.");
  }

  const payload = (await response.json()) as unknown;
  const normalized = normalizeServerWalletPayload(payload);
  if (!normalized) {
    throw new Error("Resposta inválida da carteira.");
  }

  writeStore(normalized);
  emitWalletChangedEvent();
  return Object.values(normalized.items).sort((a, b) => (a.show.eventDateIso < b.show.eventDateIso ? 1 : -1));
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

export async function hydrateWalletFromServer() {
  try {
    return await requestWalletServer({ method: "GET" });
  } catch {
    return getWalletEntries();
  }
}

export async function saveToWalletServer(show: ShowRecord) {
  try {
    return await requestWalletServer({ method: "POST", show });
  } catch {
    saveToWallet(show);
    emitWalletChangedEvent();
    return getWalletEntries();
  }
}

export async function removeFromWalletServer(showId: string) {
  try {
    return await requestWalletServer({ method: "DELETE", showId });
  } catch {
    removeFromWallet(showId);
    emitWalletChangedEvent();
    return getWalletEntries();
  }
}
