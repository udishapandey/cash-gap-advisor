import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanAnswer, JPEG_HEADER, PDF_HEADER, PNG_HEADER } from "@/lib/invoice-testing";
import { sniffMimeType } from "@/lib/invoice-upload";

// The AI is mocked: no live calls.
// Only the AI call is replaced. The real describeFailure (the log line) is kept so it is tested too.
vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  extractInvoice: vi.fn(),
}));
import { extractInvoice } from "@/lib/ai";
import { POST } from "./route";

const mocked = vi.mocked(extractInvoice);

function bytes(header: number[], size = 64, fill = 0x20) {
  const b = new Uint8Array(size).fill(fill);
  b.set(header);
  return b;
}
function upload(content: Uint8Array | string, name = "invoice.pdf", type = "application/pdf") {
  const form = new FormData();
  form.append("file", new File([content as BlobPart], name, { type }));
  return new Request("http://localhost/api/parse-invoice", { method: "POST", body: form });
}

beforeEach(() => {
  mocked.mockReset();
  mocked.mockResolvedValue({ ok: true, data: cleanAnswerParsed(), model: "gemini-3.8-flash", attempts: 1 });
});
afterEach(() => vi.restoreAllMocks());

function cleanAnswerParsed() {
  // The route returns whatever extractInvoice hands back; shape only matters to the page.
  return cleanAnswer() as never;
}

describe("file checks", () => {
  it.each([
    ["PDF", PDF_HEADER, "application/pdf"],
    ["PNG", PNG_HEADER, "image/png"],
    ["JPEG", JPEG_HEADER, "image/jpeg"],
  ])("accepts a %s and passes it on in memory", async (_label, header, mime) => {
    const res = await POST(upload(bytes(header), "invoice", mime));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mocked).toHaveBeenCalledTimes(1);
    const arg = mocked.mock.calls[0][0];
    expect(arg.mimeType).toBe(mime);
    expect(Array.from(arg.data.slice(0, header.length))).toEqual(header);
  });

  it("rejects a request with no file", async () => {
    const res = await POST(new Request("http://localhost/api/parse-invoice", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(400);
    expect(mocked).not.toHaveBeenCalled();
  });

  it("rejects an empty file", async () => {
    expect((await POST(upload(new Uint8Array(0)))).status).toBe(400);
  });

  it("rejects a body that isn't a form upload", async () => {
    const res = await POST(new Request("http://localhost/api/parse-invoice", { method: "POST", body: "hello" }));
    expect(res.status).toBe(400);
  });

  it("rejects a file whose bytes are not PDF/PNG/JPG, even if named .pdf with a PDF type", async () => {
    const res = await POST(upload("just some text pretending to be a PDF", "invoice.pdf", "application/pdf"));
    expect(res.status).toBe(415);
    expect((await res.json()).error).toContain("PDF, PNG or JPG");
    expect(mocked).not.toHaveBeenCalled();
  });

  it("accepts a real PDF even if the browser mislabels its type", async () => {
    expect((await POST(upload(bytes(PDF_HEADER), "invoice.pdf", "application/octet-stream"))).status).toBe(200);
  });

  it("allows exactly 5 MB and rejects anything bigger", async () => {
    const limit = 5 * 1024 * 1024;
    expect((await POST(upload(bytes(PDF_HEADER, limit)))).status).toBe(200);
    mocked.mockClear();
    const res = await POST(upload(bytes(PDF_HEADER, limit + 1)));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toContain("5 MB");
    expect(mocked).not.toHaveBeenCalled();
  });

  it("refuses an oversized upload from its declared length, before reading it", async () => {
    const req = new Request("http://localhost/api/parse-invoice", {
      method: "POST",
      headers: { "content-length": String(50 * 1024 * 1024) },
      body: new FormData(),
    });
    const formData = vi.spyOn(req, "formData");
    expect((await POST(req)).status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
  });

  it("recognises file types from their first bytes", () => {
    expect(sniffMimeType(bytes(PDF_HEADER))).toBe("application/pdf");
    expect(sniffMimeType(bytes(PNG_HEADER))).toBe("image/png");
    expect(sniffMimeType(bytes(JPEG_HEADER))).toBe("image/jpeg");
    expect(sniffMimeType(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(sniffMimeType(new Uint8Array(0))).toBeNull();
  });
});

describe("AI failures become clear messages", () => {
  it("429 gets a clear rate-limit message and a Retry-After header", async () => {
    mocked.mockResolvedValue({ ok: false, kind: "rate_limit", message: "The AI service is busy. Please wait.", retryAfterSeconds: 20 });
    const res = await POST(upload(bytes(PDF_HEADER)));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("20");
    expect(await res.json()).toMatchObject({ ok: false, kind: "rate_limit", error: "The AI service is busy. Please wait." });
  });

  it.each([
    ["not_configured", 503],
    ["provider_error", 502],
    ["invalid_response", 502],
  ] as const)("%s returns %i with the message", async (kind, status) => {
    mocked.mockResolvedValue({ ok: false, kind, message: "friendly message" });
    const res = await POST(upload(bytes(PDF_HEADER)));
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ ok: false, error: "friendly message" });
  });

  it("tells the page when the result came from mock mode, so it can say so", async () => {
    expect((await (await POST(upload(bytes(PDF_HEADER)))).json()).mock).toBe(false);
    mocked.mockResolvedValue({ ok: true, data: cleanAnswerParsed(), model: "mock", attempts: 0, mock: true });
    expect((await (await POST(upload(bytes(PDF_HEADER)))).json()).mock).toBe(true);
  });

  it("only an AI failure carries a kind, which is how the page knows to offer the fallbacks", async () => {
    mocked.mockResolvedValue({ ok: false, kind: "rate_limit", message: "limit" });
    expect((await (await POST(upload(bytes(PDF_HEADER)))).json()).kind).toBe("rate_limit");
    // A bad file is not an AI failure: no kind.
    const bad = await (await POST(upload("not a pdf"))).json();
    expect(bad.ok).toBe(false);
    expect(bad).not.toHaveProperty("kind");
  });

  it("returns the extraction on success, uncached", async () => {
    const res = await POST(upload(bytes(PDF_HEADER)));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect((await res.json()).extraction).toBeDefined();
  });
});

describe("the sample bill never ends in an error", () => {
  const sampleUpload = () => {
    const form = new FormData();
    form.append("file", new File([bytes(PDF_HEADER) as BlobPart], "invoice-clean.pdf", { type: "application/pdf" }));
    form.append("sample", "1");
    return new Request("http://localhost/api/parse-invoice", { method: "POST", body: form });
  };
  it.each(["provider_error", "rate_limit", "not_configured", "invalid_response"] as const)("sends the saved reading, flagged, when the AI fails with %s", async (kind) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocked.mockResolvedValue({ ok: false, kind, message: "busy" });
    const res = await POST(sampleUpload());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, saved: true, reason: kind });
    expect(body.extraction.totalAmount.value).toBe(500000);
  });
  it("an unchanged download of sample bill 2 gets its own saved reading, found by its hash", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocked.mockResolvedValue({ ok: false, kind: "provider_error", message: "busy" });
    const pdf = new Uint8Array(readFileSync("public/samples/sample-invoice-2-kaveri-soles.pdf"));
    const form = new FormData();
    form.append("file", new File([pdf as BlobPart], "whatever-name.pdf", { type: "application/pdf" }));
    const res = await POST(new Request("http://localhost/api/parse-invoice", { method: "POST", body: form }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, saved: true, badge: "Saved reading" });
    expect(body.extraction.supplierName.value).toBe("Kaveri Soles & Uppers");
  });
  it("an uploaded bill (no sample flag) still gets the error, so the page can open manual entry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocked.mockResolvedValue({ ok: false, kind: "provider_error", message: "busy" });
    const res = await POST(upload(bytes(PDF_HEADER)));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, kind: "provider_error" });
  });
});

describe("privacy: nothing from the invoice is kept or logged", () => {
  const SECRET = "SECRET-INVOICE-TEXT-98765";
  const NAME = "secret-supplier-invoice.pdf";

  it("logs the real reason for a failure, but nothing from the file", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const content = new Uint8Array([...PDF_HEADER, ...new TextEncoder().encode(SECRET)]);

    await POST(upload(content, NAME)); // success: logs nothing
    mocked.mockResolvedValue({
      ok: false,
      kind: "provider_error",
      message: "friendly",
      detail: {
        status: 503,
        providerStatus: "UNAVAILABLE",
        providerMessage: "This model is currently experiencing high demand.",
        model: "gemini-3.5-flash-lite",
        attempts: [
          { model: "gemini-3.8-flash", status: 503, providerStatus: "UNAVAILABLE", elapsedMs: 1200 },
          { model: "gemini-3.5-flash-lite", status: 503, providerStatus: "UNAVAILABLE", elapsedMs: 900 },
        ],
        elapsedMs: 2100,
      },
    });
    await POST(upload(content, NAME)); // failure
    await POST(upload(SECRET, NAME)); // rejected file type

    const logged = spies.flatMap((s) => s.mock.calls).flat().map(String).join(" ");
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain(NAME);
    // What helps debugging: kind, HTTP status, the provider's error type and message, each attempt.
    expect(logged).toContain("kind=provider_error");
    expect(logged).toContain("http=503");
    expect(logged).toContain("type=UNAVAILABLE");
    expect(logged).toContain("high demand");
    expect(logged).toContain("gemini-3.8-flash:503:UNAVAILABLE");
    expect(logged).toContain("total=2100ms");
  });

  it("never echoes the file's name or contents back in an error", async () => {
    const res = await POST(upload(SECRET, NAME));
    const text = await res.text();
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(NAME);
  });

  it("never writes to disk: the route does not use the file system", () => {
    const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+["'](node:)?fs/);
    expect(source).not.toMatch(/writeFile|createWriteStream|appendFile|mkdtemp|tmpdir/);
  });
});
