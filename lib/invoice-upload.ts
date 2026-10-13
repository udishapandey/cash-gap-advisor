import type { InvoiceMimeType } from "./ai";

// Vercel rejects request bodies over about 4.5 MB, so the limit is 4 MB, leaving room for the form around the file.
export const MAX_INVOICE_BYTES = 4 * 1024 * 1024; // 4 MB
export const TOO_LARGE_MESSAGE = "This file is too large. Try a photo or a smaller PDF.";
export const ACCEPTED_EXTENSIONS = ".pdf,.png,.jpg,.jpeg";

/** Work out the real file type from its first bytes, not from the name or the declared type. */
export function sniffMimeType(bytes: Uint8Array): InvoiceMimeType | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46)) return "application/pdf"; // %PDF
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  return null;
}
