// SIMULATED DATA. A made-up supplier invoice for the demo.

export interface Invoice {
  simulated: true;
  supplier: string;
  invoiceNumber: string;
  amount: number; // ₹
  dueInDays: number; // days from today
  earlyPayDiscountPct: number; // % off if paid within `earlyPayWithinDays`
  earlyPayWithinDays: number;
  lateFeePctPerMonth: number; // % of the amount per 30 days overdue
}

export const sampleInvoice: Invoice = {
  simulated: true,
  supplier: "Sample Footwear Manufacturer",
  invoiceNumber: "INV-DEMO-001",
  amount: 500_000,
  dueInDays: 10,
  earlyPayDiscountPct: 2,
  earlyPayWithinDays: 7,
  lateFeePctPerMonth: 1.5,
};
