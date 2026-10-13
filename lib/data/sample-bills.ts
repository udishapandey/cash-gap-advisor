// The two synthetic sample bills, and the saved reading of each. If the AI is busy, a founder who loads or uploads an
// unchanged sample file gets its saved reading instead of an error. A file is recognised by its SHA-256, never by its name.
// Nothing here is a real invoice.

import type { InvoiceExtraction } from "../invoice-extraction";
import { preReadSampleExtraction } from "./sample-extraction";

export interface SampleBill {
  id: "bill-1" | "bill-2" | "bill-3";
  /** The merchant on the bill, and the scenario it shows. Together they name the bill on the upload screen. */
  merchant: string;
  scenario: string;
  /** One line on its terms. */
  blurb: string;
  /** "Shree Ganesh Footwear · Borrow to pay early". */
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

/**
 * Bill 3: Mehta Leather Works, written from the invoice's printed text like bill 2. The 2.5% discount is only in the fine
 * print, so it also tests that the reader finds it.
 */
const bill3Extraction: InvoiceExtraction = {
  supplierName: q("Mehta Leather Works LLP", "MEHTA LEATHER WORKS LLP"),
  invoiceNumber: q("MLW/2627/0318", "MLW/2627/0318"),
  invoiceDate: q("2026-10-12", "12 Oct 2026"),
  dueDate: q("2026-10-22", "22 Oct 2026"),
  totalAmount: q(500000, "5,00,000.00"),
  quantity: q(400, "400 pairs"),
  unitPrice: q(1250, "1,250.00"),
  earlyPaymentDiscountPercent: q(2.5, "2.5%"),
  earlyPaymentDiscountDays: q(5, "within 5 days of the invoice date"),
  lateFeePercentPerMonth: q(2, "2% per month"),
} as InvoiceExtraction;

export const SAMPLE_BILLS: SampleBill[] = [
  {
    id: "bill-1",
    merchant: "Shree Ganesh Footwear",
    scenario: "Borrow to pay early",
    blurb: "₹5.00L, 2% off in 10 days, due in 30. Paying early needs an overdraft and credit.",
    label: "Shree Ganesh Footwear · Borrow to pay early",
    href: "/samples/invoice-clean.pdf",
    sha256: "9865ecee826888ff4ed3c54b95a1e6fc36185399cd439669fc133bfc6c14fe6e",
    badge: "Read by AI earlier",
    extraction: preReadSampleExtraction,
  },
  {
    id: "bill-2",
    merchant: "Kaveri Soles & Uppers",
    scenario: "Pay early from cash",
    blurb: "₹2.70L, 1.5% off in 15 days, due in 45. Paying early needs no borrowing.",
    label: "Kaveri Soles & Uppers · Pay early from cash",
    href: "/samples/sample-invoice-2-kaveri-soles.pdf",
    sha256: "19e7a0b6e864bd66daf83530a79d95562907974b6289907cb71c637c17063cc1",
    badge: "Saved reading",
    extraction: bill2Extraction,
  },
  {
    id: "bill-3",
    merchant: "Mehta Leather Works",
    scenario: "Tight deadline",
    blurb: "₹5.00L, 2.5% off in 5 days (in the fine print), due in 10. Borrowing is needed either way.",
    label: "Mehta Leather Works · Tight deadline",
    href: "/samples/invoice-hidden-discount.pdf",
    sha256: "7efbaac4739e40a8820606d18d03c259a21117626dbcd7a90c7ecf842b0be779",
    badge: "Saved reading",
    extraction: bill3Extraction,
  },
];

/** The saved reading for an unchanged sample file, found by its hash. Null for any other file. */
export function savedReadingFor(sha256: string | null): SampleBill | null {
  return sha256 ? (SAMPLE_BILLS.find((b) => b.sha256 === sha256) ?? null) : null;
}
