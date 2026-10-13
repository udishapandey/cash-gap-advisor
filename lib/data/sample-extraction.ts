// PRE-READ SAMPLE. These values were captured from a real AI reading of the synthetic sample
// invoice (public/samples/invoice-clean.pdf). They are saved here so the demo still works when the
// AI is slow or unavailable. The UI must say clearly that this was NOT read live.

import type { InvoiceExtraction } from "../invoice-extraction";

export const PRE_READ_SAMPLE_LABEL = "Pre-read sample";

export const preReadSampleExtraction: InvoiceExtraction = {
  supplierName: { value: "Shree Ganesh Footwear Pvt Ltd", evidence: "Shree Ganesh Footwear Pvt Ltd", confidence: "high" },
  invoiceNumber: { value: "SGF/26-27/0142", evidence: "SGF/26-27/0142", confidence: "high" },
  invoiceDate: { value: "2026-10-11", evidence: "11 Oct 2026", confidence: "high" },
  dueDate: { value: "2026-11-10", evidence: "10 Nov 2026", confidence: "high" },
  totalAmount: { value: 500000, evidence: "5,00,000.00", confidence: "high" },
  quantity: { value: 500, evidence: "500 pairs", confidence: "high" },
  unitPrice: { value: 1000, evidence: "1,000.00", confidence: "high" },
  earlyPaymentDiscountPercent: { value: 2, evidence: "2%", confidence: "high" },
  earlyPaymentDiscountDays: { value: 10, evidence: "10 days", confidence: "high" },
  lateFeePercentPerMonth: { value: 1.5, evidence: "1.5% per month", confidence: "high" },
};
