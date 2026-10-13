// The two synthetic sample bills, and the saved reading of each. If the AI is busy, a founder who loads or uploads an
// unchanged sample file gets its saved reading instead of an error. A file is recognised by its SHA-256, never by its name.
// Nothing here is a real invoice.

import type { InvoiceExtraction } from "../invoice-extraction";
import { preReadSampleExtraction } from "./sample-extraction";

export interface SampleBill {
  id: "bill-1" | "bill-2";
  /** "Bill 1": the link text on the upload screen. */
  label: string;
  /** Where the PDF is served from. */
  href: string;
  /** SHA-256 of the PDF, as hex. A test checks it against the file. */
  sha256: string;
  /** What the badge says when the saved reading is shown. */
  badge: string;
  extraction: InvoiceExtraction;
}

const q = (value: string | number | null, evidence: string | null, confidence: "high" | "medium" | "low" = "high") => ({
  value,
  evidence,
  confidence,
});

/**
 * Bill 2: Kaveri Soles & Uppers, written from the invoice's printed text (each quote is checked against it in a test), not
 * captured from a live read. The late charge is printed as 18% per annum, so the monthly field holds 1.5 with the conversion note.
 */
const bill2Extraction: InvoiceExtraction = {
  supplierName: q("Kaveri Soles & Uppers", "Kaveri Soles & Uppers"),
  invoiceNumber: q("KSU/26-27/0387", "KSU/26-27/0387"),
  invoiceDate: q("2026-10-14", "14 Oct 2026"),
  dueDate: q("2026-11-28", "28 Nov 2026"),
  totalAmount: q(270000, "2,70,000.00"),
  quantity: q(300, "300 pairs"),
  unitPrice: q(900, "900.00"),
  earlyPaymentDiscountPercent: q(1.5, "1.5%"),
  earlyPaymentDiscountDays: q(15, "within 15 days of invoice date"),
  lateFeePercentPerMonth: q(1.5, "Printed as 18% per annum, converted to 1.5% per month"),
} as InvoiceExtraction;

export const SAMPLE_BILLS: SampleBill[] = [
  {
    id: "bill-1",
    label: "Bill 1",
    href: "/samples/invoice-clean.pdf",
    sha256: "9865ecee826888ff4ed3c54b95a1e6fc36185399cd439669fc133bfc6c14fe6e",
    badge: "Read by AI earlier",
    extraction: preReadSampleExtraction,
  },
  {
    id: "bill-2",
    label: "Bill 2",
    href: "/samples/sample-invoice-2-kaveri-soles.pdf",
    sha256: "19e7a0b6e864bd66daf83530a79d95562907974b6289907cb71c637c17063cc1",
    badge: "Saved reading",
    extraction: bill2Extraction,
  },
];

/** The saved reading for an unchanged sample file, found by its hash. Null for any other file. */
export function savedReadingFor(sha256: string | null): SampleBill | null {
  return sha256 ? (SAMPLE_BILLS.find((b) => b.sha256 === sha256) ?? null) : null;
}
