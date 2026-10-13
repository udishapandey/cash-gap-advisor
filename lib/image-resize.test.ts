import { describe, expect, it } from "vitest";
import { MAX_EDGE_PX, fitWithin } from "./image-resize";
import { MAX_INVOICE_BYTES, TOO_LARGE_MESSAGE } from "./invoice-upload";

describe("shrinking a phone photo before upload", () => {
  it("caps the long edge at 1600px and keeps the shape", () => {
    expect(MAX_EDGE_PX).toBe(1600);
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });
  it("never makes a small image bigger", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });
  it("keeps at least one pixel on a very thin image", () => {
    expect(fitWithin(100_000, 10)).toEqual({ width: 1600, height: 1 });
  });
});

describe("the upload limit", () => {
  it("is 4 MB, under the hosting limit of about 4.5 MB, with one friendly message for 'too large'", () => {
    expect(MAX_INVOICE_BYTES).toBe(4 * 1024 * 1024);
    expect(TOO_LARGE_MESSAGE).toBe("This file is too large. Try a photo or a smaller PDF.");
  });
});
