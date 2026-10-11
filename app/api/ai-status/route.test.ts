import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

// connection() only works inside a running Next.js request, so stand in for it here.
vi.mock("next/server", () => ({ connection: async () => {} }));

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/ai-status", () => {
  it("says mock mode is on when AI_MOCK=true", async () => {
    vi.stubEnv("AI_MOCK", "true");
    const res = await GET();
    expect(await res.json()).toEqual({ mock: true });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("says it is off otherwise", async () => {
    vi.stubEnv("AI_MOCK", "");
    expect(await (await GET()).json()).toEqual({ mock: false });
    vi.stubEnv("AI_MOCK", "false");
    expect(await (await GET()).json()).toEqual({ mock: false });
  });

  it("reveals nothing else: no keys, models or provider", async () => {
    vi.stubEnv("AI_MOCK", "true");
    vi.stubEnv("GEMINI_API_KEY", "SECRET-KEY-VALUE");
    vi.stubEnv("GEMINI_MODEL", "some-model");
    const text = JSON.stringify(await (await GET()).json());
    expect(text).not.toContain("SECRET-KEY-VALUE");
    expect(text).not.toContain("some-model");
    expect(Object.keys(JSON.parse(text))).toEqual(["mock"]);
  });
});
