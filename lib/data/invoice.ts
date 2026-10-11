// SIMULATED DATA. A made-up supplier invoice for the demo.

export interface Invoice {
  simulated: true;
  supplier: string;
  invoiceNumber: string;
  units: number; // pairs ordered
  unitPrice: number; // ₹ per pair, what the supplier charges
  amount: number; // ₹, always units × unitPrice
  dueInDays: number; // days from today
  earlyPayDiscountPct: number; // % off if paid within `earlyPayWithinDays`
  earlyPayWithinDays: number;
  lateFeePctPerMonth: number; // % of the amount per 30 days overdue
}

export const sampleInvoice: Invoice = {
  simulated: true,
  supplier: "Sample Footwear Manufacturer",
  invoiceNumber: "INV-DEMO-001",
  units: 500,
  unitPrice: 1_000,
  amount: 500_000,
  dueInDays: 10,
  earlyPayDiscountPct: 2,
  earlyPayWithinDays: 7,
  lateFeePctPerMonth: 1.5,
};
