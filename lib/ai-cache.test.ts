import { describe, expect, it, vi } from "vitest";
import { AI_CACHE_KEY, readAiCache, writeAiCache } from "./ai-cache";

const isText = (v: unknown): v is { text: string } => typeof (v as { text?: unknown })?.text === "string";
function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), raw: () => data.get(AI_CACHE_KEY) };
}

describe("the browser's AI cache", () => {
  it("returns a saved answer for the same request, and nothing for another", () => {
    const s = memory();
    writeAiCache(s, "h1", { text: "hello" });
    expect(readAiCache(s, "h1", isText)).toEqual({ text: "hello" });
    expect(readAiCache(s, "h2", isText)).toBeNull();
  });
  it("ignores a saved entry that no longer has the right shape", () => {
    const s = memory({ [AI_CACHE_KEY]: JSON.stringify({ h1: { value: { nope: 1 }, savedAt: 1 } }) });
    expect(readAiCache(s, "h1", isText)).toBeNull();
  });
  it("copes with corrupted storage", () => {
    for (const raw of ["not json", "[]", "7", "null"]) expect(readAiCache(memory({ [AI_CACHE_KEY]: raw }), "h", isText)).toBeNull();
  });
  it("never throws when storage is blocked or full", () => {
    const blocked = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(() => writeAiCache(blocked, "h", { text: "a" })).not.toThrow();
    expect(readAiCache(blocked, "h", isText)).toBeNull();
  });
  it("keeps only the 40 most recent answers", () => {
    vi.useFakeTimers();
    const s = memory();
    for (let i = 0; i < 45; i++) {
      vi.setSystemTime(1000 + i);
      writeAiCache(s, `h${i}`, { text: String(i) });
    }
    vi.useRealTimers();
    expect(Object.keys(JSON.parse(s.raw()!))).toHaveLength(40);
    expect(readAiCache(s, "h0", isText)).toBeNull();
    expect(readAiCache(s, "h44", isText)).not.toBeNull();
  });
});
