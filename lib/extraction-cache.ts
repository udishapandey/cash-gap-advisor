// Remembers what the AI read, per file, for this browser tab only (session storage).
// Re-uploading the same file then reuses the result instead of calling the AI again.
// Only the extracted fields are kept, keyed by a fingerprint of the file. The file itself is never stored.

import { parseExtraction, type InvoiceExtraction } from "./invoice-extraction";

export const CACHE_KEY = "cga.extractionCache.v1";
const MAX_ENTRIES = 20;

type StorageLike = Pick<Storage, "getItem" | "setItem">;
interface Entry {
  extraction: unknown;
  savedAt: number;
}

/** SHA-256 fingerprint of a file's bytes, as hex. Null if the browser can't compute it. */
export async function hashBytes(bytes: ArrayBuffer): Promise<string | null> {
  try {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

function load(storage: StorageLike): Record<string, Entry> {
  try {
    const raw = JSON.parse(storage.getItem(CACHE_KEY) ?? "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

/** The saved reading for this file, if there is one and it is still valid. */
export function readCached(storage: StorageLike, hash: string): InvoiceExtraction | null {
  const entry = load(storage)[hash];
  if (!entry) return null;
  const parsed = parseExtraction(entry.extraction);
  return parsed.ok ? parsed.data : null;
}

/** Save a reading. Keeps the 20 most recent files. Never throws: storage can be full or blocked. */
export function writeCached(storage: StorageLike, hash: string, extraction: InvoiceExtraction): void {
  try {
    const entries = load(storage);
    entries[hash] = { extraction, savedAt: Date.now() };
    const newest = Object.entries(entries)
      .sort(([, a], [, b]) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
      .slice(0, MAX_ENTRIES);
    storage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch {
    // Not being able to cache is fine; the next upload simply asks the AI again.
  }
}
