// Every rate, fee and multiplier the engine uses lives here.
// Each one is documented in docs/ASSUMPTIONS.md. Plain numbers only: no AI touches money.

export const CONFIG = {
  // Festive sales multipliers applied to the recent daily-sales baseline.
  scenarioUplift: { low: 1.1, expected: 1.4, high: 1.7 },

  // Flag the forecast as low confidence when (worst gap - best gap) is wider than this share of the invoice.
  lowConfidenceWidthShare: 0.4,

  // The sales baseline is the average of the most recent N days of orders.
  baselineDays: 30,

  // Instant settlement (getting your own prepaid sales money before the normal T+N date).
  // A flat fee on the amount settled, plus GST on the fee, charged once per settlement, not per day.
  // Capped at the sales earned but not yet settled, and at an illustrative daily limit.
  earlySettlementFeePct: 0.3,
  earlySettlementGstPct: 18,
  earlySettlementDailyLimit: 200_000, // ₹, illustrative

  // Borrowing. Annual rates, interest charged per day on the amount used, repayable any time with no pre-closure charge.
  creditLineRatePct: 18, // illustrative; Razorpay quotes 18 to 32% APR, from 1.5% a month
  overdraftRatePct: 11, // illustrative; a typical secured MSME overdraft

  // Safety: keep at least this much in the account on every day (illustrative).
  safetyBufferRupees: 50_000,

  // Repayment is simulated day by day. Money still owed when the bill window ends keeps being repaid from the forecast,
  // for at most this many more days.
  repaymentHorizonDays: 90,

  // Split order: part of the order is delivered (and paid for) later.
  maxSplitShareOfInvoice: 0.3,

  // Stock. Used to price the risk of ordering fewer pairs than would have sold.
  stock: {
    sellingPricePerPair: 1_700, // ₹
    grossMarginPct: 40, // % of selling price
    lastDiwaliUnitsSold: 520, // SIMULATED: pairs of this festive range sold last Diwali
  },

  // The share of the order that would stay unsold above which ordering fewer pairs is worth a look (shown only as a row in the options table).
  rightSizeUnsoldThreshold: 0.1,

  // Supplier extension: how many extra days we ask for. Shown as an "ask first" step, never in the plan.
  extensionDays: 15,

  // After the season: how far the system moves its estimates toward what it observed (0 = ignore, 1 = replace).
  learningRate: 0.5,

  daysPerYear: 365,
  daysPerMonth: 30,
} as const;

export type Scenario = keyof typeof CONFIG.scenarioUplift;
export const SCENARIOS: Scenario[] = ["low", "expected", "high"];
