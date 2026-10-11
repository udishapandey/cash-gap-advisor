// The browser's own cache of AI answers, per tab (session storage), keyed by a hash of the request.
// Asking the same thing again shows the saved answer and makes no AI call (the free tier is small).
// Only verified answers are saved, and only the answer text: never the invoice.

export const AI_CACHE_KEY = "cga.aiCache.v1";
const MAX_ENTRIES = 40;

type StorageLike = Pick<Storage, "getItem" | "setItem">;
interface Entry {
  value: unknown;
  savedAt: number;
}

function load(storage: StorageLike): Record<string, Entry> {
  try {
    const raw = JSON.parse(storage.getItem(AI_CACHE_KEY) ?? "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

/** A saved answer for this request, if there is one and it still has the right shape. */
export function readAiCache<T>(storage: StorageLike, hash: string, isValid: (v: unknown) => v is T): T | null {
  const entry = load(storage)[hash];
  return entry && isValid(entry.value) ? entry.value : null;
}

/** Save an answer. Keeps the most recent 40. Never throws: storage can be full or blocked. */
export function writeAiCache(storage: StorageLike, hash: string, value: unknown): void {
  try {
    const entries = load(storage);
    entries[hash] = { value, savedAt: Date.now() };
    const newest = Object.entries(entries)
      .sort(([, a], [, b]) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
      .slice(0, MAX_ENTRIES);
    storage.setItem(AI_CACHE_KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch {
    // Not being able to cache just means the next identical question asks again.
  }
}
