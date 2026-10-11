import { afterEach, describe, expect, it, vi } from "vitest";
import { CACHE_KEY, hashBytes, readCached, writeCached } from "./extraction-cache";
import { parseExtraction } from "./invoice-extraction";
import { cleanAnswer } from "./invoice-testing";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    raw: () => data.get(CACHE_KEY),
  };
}
const extraction = () => {
  const r = parseExtraction(cleanAnswer());
  if (!r.ok) throw new Error(r.message);
  return r.data;
};
const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

afterEach(() => vi.useRealTimers());

describe("file fingerprint", () => {
  it("is the SHA-256 of the file's bytes", async () => {
    expect(await hashBytes(bytes("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("is the same for the same file and different for a different one", async () => {
    expect(await hashBytes(bytes("invoice A"))).toBe(await hashBytes(bytes("invoice A")));
    expect(await hashBytes(bytes("invoice A"))).not.toBe(await hashBytes(bytes("invoice B")));
  });
  it("is null, not an error, when the browser can't compute it", async () => {
    vi.stubGlobal("crypto", {});
    expect(await hashBytes(bytes("abc"))).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("reusing an earlier reading of the same file", () => {
  it("misses the first time, then returns the saved reading for the same file", async () => {
    const storage = memoryStorage();
    const hash = (await hashBytes(bytes("the same invoice file")))!;

    expect(readCached(storage, hash)).toBeNull(); // first upload: the AI is called

    writeCached(storage, hash, extraction());

    const again = (await hashBytes(bytes("the same invoice file")))!; // re-upload the same file
    expect(readCached(storage, again)).toEqual(extraction()); // reused: no AI call
  });

  it("does not return another file's reading", async () => {
    const storage = memoryStorage();
    writeCached(storage, (await hashBytes(bytes("file one")))!, extraction());
    expect(readCached(storage, (await hashBytes(bytes("file two")))!)).toBeNull();
  });

  it("stores only the extracted fields, never the file", () => {
    const storage = memoryStorage();
    writeCached(storage, "abc123", extraction());
    const entry = JSON.parse(storage.raw()!).abc123;
    expect(Object.keys(entry).sort()).toEqual(["extraction", "savedAt"]);
    expect(Object.keys(entry.extraction)).toHaveLength(10);
  });

  it("ignores a saved entry that no longer passes validation", () => {
    const storage = memoryStorage({
      [CACHE_KEY]: JSON.stringify({ h1: { extraction: { totalAmount: "oops" }, savedAt: 1 } }),
    });
    expect(readCached(storage, "h1")).toBeNull();
  });

  it("copes with corrupted or unexpected storage contents", () => {
    for (const raw of ["not json", "[]", "42", "null"]) {
      expect(readCached(memoryStorage({ [CACHE_KEY]: raw }), "h1")).toBeNull();
    }
  });

  it("never throws if storage is full or blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };
    expect(() => writeCached(blocked, "h1", extraction())).not.toThrow();
    expect(readCached(blocked, "h1")).toBeNull();
  });

  it("keeps only the 20 most recent files", () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    for (let i = 0; i < 25; i++) {
      vi.setSystemTime(1_000 + i);
      writeCached(storage, `hash${i}`, extraction());
    }
    const kept = Object.keys(JSON.parse(storage.raw()!));
    expect(kept).toHaveLength(20);
    expect(kept).not.toContain("hash0"); // oldest dropped
    expect(kept).toContain("hash24"); // newest kept
    expect(readCached(storage, "hash4")).toBeNull();
    expect(readCached(storage, "hash5")).not.toBeNull();
  });

  it("saving a new file keeps the other files' readings", () => {
    const storage = memoryStorage();
    writeCached(storage, "a", extraction());
    writeCached(storage, "b", extraction());
    expect(readCached(storage, "a")).not.toBeNull();
    expect(readCached(storage, "b")).not.toBeNull();
  });
});
