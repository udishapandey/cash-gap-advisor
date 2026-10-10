// Every rate, fee and multiplier the engine uses lives here.
// Each one is documented in docs/ASSUMPTIONS.md. Plain numbers only: no AI touches money.

export const CONFIG = {
  // Festive sales multipliers applied to the recent daily-sales baseline.
  scenarioUplift: { low: 1.1, expected: 1.4, high: 1.7 },

  // Flag the forecast as low confidence when (worst gap - best gap) is wider than this share of the invoice.
  lowConfidenceWidthShare: 0.4,

  // The sales baseline is the average of the most recent N days of orders.
  baselineDays: 30,

  // Early settlement (getting your own prepaid sales money before the normal T+N date).
  earlySettlementFeePct: 0.3,

  // Borrowing. Annual rates, simple interest.
  creditLineRatePct: 18,
  overdraftRatePct: 14,
  borrowDays: 30, // how long borrowed money is assumed to stay out

  // Split order: part of the order is delivered (and paid for) later.
  maxSplitShareOfInvoice: 0.3,

  // Supplier extension: how many extra days we ask for.
  extensionDays: 15,

  daysPerYear: 365,
  daysPerMonth: 30,
} as const;

export type Scenario = keyof typeof CONFIG.scenarioUplift;
export const SCENARIOS: Scenario[] = ["low", "expected", "high"];
