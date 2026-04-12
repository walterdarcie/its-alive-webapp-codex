"use client";

import type { ShowRecord, WalletStatus } from "@/lib/show-types";
import { deriveWalletStatus } from "@/lib/show-utils";

const STORAGE_KEY = "its-alive.wallet.v1";
const PENDING_OPS_KEY = "its-alive.wallet.pending.v1";

export type WalletEntry = {
  show: ShowRecord;
  savedAt: string;
};

export type WalletSyncResult = {
  entries: WalletEntry[];
  synced: boolean;
};

type WalletStoreShape = {
  items: Record<string, WalletEntry>;
};

type PendingWalletOp =
  | {
      type: "save";
      show: ShowRecord;
      createdAt: string;
    }
  | {
      type: "remove";
      showId: string;
      createdAt: string;
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

function readPendingOps(): PendingWalletOp[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(PENDING_OPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((op): op is PendingWalletOp => {
      if (!op || typeof op !== "object") return false;
      if ("type" in op && op.type === "save") {
        return Boolean((op as PendingWalletOp & { show?: ShowRecord }).show?.id);
      }
      if ("type" in op && op.type === "remove") {
        return typeof (op as PendingWalletOp & { showId?: string }).showId === "string";
      }
      return false;
    });
  } catch {
    return [];
  }
}

function writePendingOps(ops: PendingWalletOp[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(PENDING_OPS_KEY, JSON.stringify(ops));
}

function opShowId(op: PendingWalletOp) {
  return op.type === "save" ? op.show.id : op.showId;
}

function upsertPendingOp(op: PendingWalletOp) {
  const current = readPendingOps();
  const targetShowId = opShowId(op);
  const next = current.filter((item) => opShowId(item) !== targetShowId);
  next.push(op);
  writePendingOps(next);
}

function clearPendingOpsForShow(showId: string) {
  const current = readPendingOps();
  const next = current.filter((item) => opShowId(item) !== showId);
  if (next.length !== current.length) {
    writePendingOps(next);
  }
}

async function flushPendingOps() {
  const queue = readPendingOps();
  if (!queue.length) return;

  for (let index = 0; index < queue.length; index += 1) {
    const op = queue[index];
    try {
      if (op.type === "save") {
        await requestWalletServer({ method: "POST", show: op.show });
      } else {
        await requestWalletServer({ method: "DELETE", showId: op.showId });
      }
    } catch {
      // Keep unflushed operations for the next sync attempt.
      writePendingOps(queue.slice(index));
      throw new Error("Pending wallet sync failed.");
    }
  }

  writePendingOps([]);
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

export async function hydrateWalletFromServer(): Promise<WalletSyncResult> {
  try {
    await flushPendingOps();
    const entries = await requestWalletServer({ method: "GET" });
    return { entries, synced: true };
  } catch {
    return { entries: getWalletEntries(), synced: false };
  }
}

export async function saveToWalletServer(show: ShowRecord): Promise<WalletSyncResult> {
  try {
    const entries = await requestWalletServer({ method: "POST", show });
    clearPendingOpsForShow(show.id);
    return { entries, synced: true };
  } catch {
    saveToWallet(show);
    upsertPendingOp({
      type: "save",
      show,
      createdAt: new Date().toISOString()
    });
    emitWalletChangedEvent();
    return { entries: getWalletEntries(), synced: false };
  }
}

export async function removeFromWalletServer(showId: string): Promise<WalletSyncResult> {
  try {
    const entries = await requestWalletServer({ method: "DELETE", showId });
    clearPendingOpsForShow(showId);
    return { entries, synced: true };
  } catch {
    removeFromWallet(showId);
    upsertPendingOp({
      type: "remove",
      showId,
      createdAt: new Date().toISOString()
    });
    emitWalletChangedEvent();
    return { entries: getWalletEntries(), synced: false };
  }
}
