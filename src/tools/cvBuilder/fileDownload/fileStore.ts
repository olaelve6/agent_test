import { randomUUID } from "crypto";

/**
 * Tiny in-memory store for files the bot has generated and wants the user
 * to download. Each entry is keyed by a random id and expires after a TTL
 * so links don't live forever. For multi-instance deploys, swap this for
 * a shared store (Redis, blob storage, etc.).
 */

export type StoredFile = {
  filename: string;
  contentType: string;
  /** Raw bytes to serve. */
  body: Buffer;
  /** Epoch ms when this entry should be considered gone. */
  expiresAt: number;
};

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

const store = new Map<string, StoredFile>();

/** Drop expired entries. Called opportunistically on every read/write. */
function evictExpired() {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (entry.expiresAt <= now) store.delete(id);
  }
}

/** Add a file to the store and return its generated id. */
export function putFile(
  file: Omit<StoredFile, "expiresAt">,
  ttlMs: number = DEFAULT_TTL_MS
): string {
  evictExpired();
  const id = randomUUID();
  store.set(id, { ...file, expiresAt: Date.now() + ttlMs });
  return id;
}

/** Look up a file by id. Returns null if missing or expired. */
export function getFile(id: string): StoredFile | null {
  evictExpired();
  return store.get(id) ?? null;
}
