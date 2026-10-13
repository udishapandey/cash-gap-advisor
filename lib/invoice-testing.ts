// Test helpers: a pretend AI answer for the clean sample invoice. Not used by the app.

type Confidence = "high" | "medium" | "low";

export const field = (value: unknown, evidence: string | null, confidence: Confidence = "high") => ({
  value,
  evidence,
  confidence,
});

/** What the AI should return for public/samples/invoice-clean.pdf. */
export function cleanAnswer(): Record<string, ReturnType<typeof field>> {
  return {
    supplierName: field("Shree Ganesh Footwear Pvt Ltd", "Shree Ganesh Footwear Pvt Ltd"),
    invoiceNumber: field("SGF/26-27/0142", "SGF/26-27/0142"),
    invoiceDate: field("2026-10-11", "11 Oct 2026"),
    dueDate: field("2026-11-10", "10 Nov 2026"),
    totalAmount: field(500000, "5,00,000.00"),
    quantity: field(500, "500 pairs"),
    unitPrice: field(1000, "1,000.00"),
    earlyPaymentDiscountPercent: field(2, "2%"),
    earlyPaymentDiscountDays: field(10, "10 days"),
    lateFeePercentPerMonth: field(1.5, "1.5% per month"),
  };
}

export const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]; // %PDF-1.4
export const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0];
