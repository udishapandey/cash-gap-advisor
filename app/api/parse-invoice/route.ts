import { describeFailure, extractInvoice, type ExtractInvoiceFailure } from "@/lib/ai";
import { preReadSampleExtraction } from "@/lib/data/sample-extraction";
import { MAX_INVOICE_BYTES, sniffMimeType } from "@/lib/invoice-upload";

// Privacy: the uploaded invoice is processed in memory only. It is never written to disk,
// and neither its contents nor its filename are ever logged.

// Vercel: allow the full 45s AI budget plus a margin.
export const maxDuration = 60;

const MULTIPART_OVERHEAD = 64 * 1024;

const STATUS: Record<ExtractInvoiceFailure["kind"], number> = {
  rate_limit: 429,
  not_configured: 503,
  provider_error: 502,
  invalid_response: 502,
};

function json(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function POST(request: Request) {
  // Refuse oversized uploads before reading the body.
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_INVOICE_BYTES + MULTIPART_OVERHEAD) {
    return json({ ok: false, error: "File too large. Maximum 5 MB." }, 413);
  }

  let file: FormDataEntryValue | null;
  let isSample = false;
  try {
    const form = await request.formData();
    file = form.get("file");
    isSample = form.get("sample") === "1";
  } catch {
    return json({ ok: false, error: "Couldn't read the upload. Choose a file and try again." }, 400);
  }
  if (!(file instanceof File) || file.size === 0) {
    return json({ ok: false, error: "No file received. Choose a PDF, PNG or JPG." }, 400);
  }
  if (file.size > MAX_INVOICE_BYTES) {
    return json({ ok: false, error: "File too large. Maximum 5 MB." }, 413);
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffMimeType(data);
  if (!mimeType) {
    return json({ ok: false, error: "Unsupported file type. Upload a PDF, PNG or JPG." }, 415);
  }

  const result = await extractInvoice({ data, mimeType });
  if (!result.ok) {
    // Log why it failed (HTTP status, provider error type and message, each attempt), never the invoice.
    console.error(`[parse-invoice] ${describeFailure(result)}`);
    // The synthetic sample bill never ends in an error: if the AI is down, send its saved reading, flagged as saved.
    if (isSample) return json({ ok: true, saved: true, extraction: preReadSampleExtraction, reason: result.kind }, 200);
    return json(
      { ok: false, kind: result.kind, error: result.message },
      STATUS[result.kind],
      result.retryAfterSeconds ? { "Retry-After": String(result.retryAfterSeconds) } : {},
    );
  }
  return json({ ok: true, extraction: result.data, mock: result.mock === true }, 200);
}
