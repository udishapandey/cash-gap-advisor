import { describe, expect, it } from "vitest";
import { hashInput, sha256Hex, stableStringify } from "./hash";

describe("stableStringify", () => {
  it("gives the same text whatever order the keys were written in", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
  });
  it("keeps the order of an array, because it matters", () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });
  it("tells different data apart", () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
    expect(stableStringify({ a: "1" })).not.toBe(stableStringify({ a: 1 }));
  });
  it("ignores undefined, like JSON does, and handles null and primitives", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify("x")).toBe('"x"');
    expect(stableStringify(5)).toBe("5");
  });
});

describe("hashing", () => {
  it("is the SHA-256 of the text", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("gives one fingerprint to equal inputs and another to different ones", async () => {
    expect(await hashInput({ a: 1, b: [1, 2] })).toBe(await hashInput({ b: [1, 2], a: 1 }));
    expect(await hashInput({ a: 1 })).not.toBe(await hashInput({ a: 2 }));
  });
});
