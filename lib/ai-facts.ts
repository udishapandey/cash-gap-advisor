// The ONLY information the AI is given: the engine's own numbers, as small structured JSON.
// No invoice text, no file contents. (The one exception is the supplier name in the call script,
// which is sanitised and marked as data.) Key names end in "Rupees" or "Percent" on purpose:
// the grounding check uses that to know which numbers a ₹ amount or a % may match.

import type { Invoice } from "./data/invoice";
import type { EngineResult, ViewResult } from "./engine";
import { CONFIG } from "./engine/config";
import type { OptionId, Plan } from "./engine/options";
import { expectedLostMargin } from "./engine/stock";
import { formatINR, formatPct } from "./format";
import { earlyPayDay } from "./journey";

const SOURCE_NAMES: Record<OptionId, string> = {
  early_settlement: "early settlement",
  credit_line: "credit line",
  bank_overdraft: "bank overdraft",
  split_order: "split order",
};

export interface StepFacts {
  source: string;
  amountRupees: number;
  costRupees: number;
  isLoan: boolean;
}

export interface ViewFacts {
  pairs: number;
  orderRupees: number;
  /** The worst single-day shortfall over the whole window: what the plan has to cover. */
  peakShortfallRupees: number;
  loanRupees: number;
  fundingCostRupees: number;
  payByDay: number;
  paysEarlyForDiscount: boolean;
  earlyPaymentDiscountPercent: number;
  earlyPaymentDiscountRupees: number;
  /** Paying early costs more cash earlier, so more funding. Zero when the plan pays on the due date. */
  extraCostOfPayingEarlyRupees: number;
  /** The discount minus that extra cost: how much better off paying early is than paying on the due date. */
  netSavingFromEarlyPaymentRupees: number;
  fullyCovered: boolean;
  uncoveredRupees: number;
  steps: StepFacts[];
}

export interface ExplainFacts {
  salesDropPercent: number;
  invoiceRupees: number;
  pairsOrdered: number;
  dueInDays: number;
  cashElsewhereRupees: number;
  /** The plan the numbers favour: "keep_full" or "right_sized". */
  recommendedPlan: "keep_full" | "right_sized";
  keepFull: ViewFacts;
  rightSized: ViewFacts;
  stock: {
    forecastPairsToSell: number;
    unsoldPairsAtExpectedSales: number;
    unsoldAtExpectedSalesPercent: number;
    /** The same, if sales come in at the low end of the forecast instead of at the expected level. */
    lowSalesForecastPairs: number;
    unsoldPairsAtLowSales: number;
    unsoldAtLowSalesPercent: number;
    cashSavedByRightSizingRupees: number;
    expectedLostMarginRupees: number;
  };
  ratesPercent: {
    earlySettlementFeePercent: number;
    earlySettlementAnnualisedPercent: number;
    creditLineAnnualPercent: number;
    overdraftAnnualPercent: number;
  };
  lowConfidenceForecast: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

function viewFacts(v: ViewResult): ViewFacts {
  const plan = v.recommended.plan;
  const early = v.recommended.timing === "pay_early_for_discount";
  return {
    pairs: v.units,
    orderRupees: v.orderValue,
    peakShortfallRupees: plan.gap,
    loanRupees: v.loan,
    fundingCostRupees: plan.totalCost,
    payByDay: early ? earlyPayDay(v.invoice) : v.invoice.dueInDays,
    paysEarlyForDiscount: early,
    earlyPaymentDiscountPercent: early ? v.invoice.earlyPayDiscountPct : 0,
    earlyPaymentDiscountRupees: early ? v.discount.discountAmount : 0,
    extraCostOfPayingEarlyRupees: early ? v.discount.extraFundingCost : 0,
    netSavingFromEarlyPaymentRupees: early ? v.discount.netSaving : 0,
    fullyCovered: plan.fullyCovered,
    uncoveredRupees: plan.uncovered,
    steps: plan.steps.map((s) => ({
      source: SOURCE_NAMES[s.optionId],
      amountRupees: s.amount,
      costRupees: s.cost,
      isLoan: s.isBorrowing,
    })),
  };
}

/** The numbers behind the "Why this plan" explanation, taken straight from the engine result. */
export function planFacts(result: EngineResult): ExplainFacts {
  const { keepFull, rightSized } = result.views;
  const { stock } = result;
  const demand = stock.demandByScenario[stock.basis];
  const rate = (id: OptionId) => keepFull.options.find((o) => o.id === id)?.annualisedPct ?? 0;
  return {
    salesDropPercent: keepFull.gap.salesDropPercent,
    invoiceRupees: keepFull.invoice.amount,
    pairsOrdered: stock.fullUnits,
    dueInDays: keepFull.invoice.dueInDays,
    cashElsewhereRupees: keepFull.gap.scenarios.expected.cash.cashElsewhere,
    recommendedPlan: result.recommendedView,
    keepFull: viewFacts(keepFull),
    rightSized: viewFacts(rightSized),
    stock: {
      forecastPairsToSell: Math.floor(demand),
      unsoldPairsAtExpectedSales: stock.unitsCut,
      unsoldAtExpectedSalesPercent: round1(stock.unsoldShare * 100),
      lowSalesForecastPairs: Math.floor(stock.demandByScenario.low),
      unsoldPairsAtLowSales: Math.max(0, stock.fullUnits - Math.floor(stock.demandByScenario.low)),
      unsoldAtLowSalesPercent: round1((Math.max(0, stock.fullUnits - Math.floor(stock.demandByScenario.low)) / stock.fullUnits) * 100),
      cashSavedByRightSizingRupees: stock.cashSaved,
      expectedLostMarginRupees: expectedLostMargin({
        orderUnits: stock.fullUnits,
        unitsNotOrdered: stock.unitsCut,
        demandUnits: demand,
      }).expectedLostMargin,
    },
    ratesPercent: {
      earlySettlementFeePercent: CONFIG.earlySettlementFeePct,
      earlySettlementAnnualisedPercent: round2(rate("early_settlement")),
      creditLineAnnualPercent: round2(rate("credit_line")),
      overdraftAnnualPercent: round2(rate("bank_overdraft")),
    },
    lowConfidenceForecast: keepFull.gap.lowConfidence,
  };
}

// ---------- The supplier call script ----------

export interface ScriptFacts {
  /** From the invoice. Sanitised, and the prompt treats it as data only. */
  supplierName: string;
  invoiceNumber: string | null;
  invoiceRupees: number;
  pairsOrdered: number;
  dueInDays: number;
  extraDaysRequested: number;
  /** What could be paid on time without borrowing, and what would be left for later. */
  payOnTimeRupees: number;
  payLaterRupees: number;
  earlyPaymentDiscountPercent: number;
  lateFeeMonthlyPercent: number;
  borrowingRemovedIfAgreedRupees: number;
}

/** Strip anything that isn't plain printable text, so a name from an invoice can't carry hidden instructions. */
export function cleanText(text: string, max: number): string {
  return text
    .replace(/[\u0000-\u001f\u007f<>{}\[\]`\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * The facts for a phone call to the supplier. `plan` is the plan for paying on the due date. The part that
 * can be paid on time is the invoice minus the peak shortfall; the rest is what an extension would cover.
 */
export function scriptFacts(
  invoice: Invoice,
  plan: Plan,
  o: { extensionDays: number; borrowingRemovedRupees: number },
): ScriptFacts {
  const payLater = plan.gap > 0 ? Math.min(plan.gap, invoice.amount) : 0;
  return {
    supplierName: cleanText(invoice.supplier, 60) || "the supplier",
    invoiceNumber: cleanText(invoice.invoiceNumber, 40) || null,
    invoiceRupees: invoice.amount,
    pairsOrdered: invoice.units,
    dueInDays: invoice.dueInDays,
    extraDaysRequested: o.extensionDays,
    payOnTimeRupees: invoice.amount - payLater,
    payLaterRupees: payLater,
    earlyPaymentDiscountPercent: invoice.earlyPayDiscountPct,
    lateFeeMonthlyPercent: invoice.lateFeePctPerMonth,
    borrowingRemovedIfAgreedRupees: o.borrowingRemovedRupees,
  };
}

// ---------- What the AI is actually shown ----------

const PLAN_NAMES: Record<string, string> = { keep_full: "keep the full order", right_sized: "order fewer pairs now (right-sized)" };

/** "peakShortfallRupees" -> "peak shortfall". Plain words, so the AI has no code-looking names to copy. */
function label(key: string): string {
  return key
    .replace(/(Rupees|Percent)$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
}

/**
 * The same facts, written for the AI to read: plain-word labels instead of field names, and every ₹ amount and % already
 * formatted ("₹2,88,151", "55%"), so it can copy them exactly. The grounding check still uses the numeric `facts`.
 */
export function promptFacts(facts: unknown): unknown {
  const walk = (value: unknown, key: string): unknown => {
    if (typeof value === "number") {
      if (/Rupees$/.test(key)) return formatINR(value);
      if (/Percent$/.test(key)) return formatPct(value);
      return value;
    }
    if (typeof value === "string") return PLAN_NAMES[value] ?? value;
    if (Array.isArray(value)) return value.map((v) => walk(v, key));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [label(k) || k, walk(v, k)]));
    }
    return value;
  };
  return walk(facts, "");
}

/** What the AI sees for the explanation: only the plan being recommended, in plain words with formatted numbers. */
export function explainPromptFacts(f: ExplainFacts): unknown {
  return promptFacts({
    recommendedPlan: f.recommendedPlan,
    invoiceRupees: f.invoiceRupees,
    pairsOrdered: f.pairsOrdered,
    dueInDays: f.dueInDays,
    salesDropPercent: f.salesDropPercent,
    cashElsewhereRupees: f.cashElsewhereRupees,
    plan: f.recommendedPlan === "right_sized" ? f.rightSized : f.keepFull,
    stock: f.stock,
    ratesPercent: f.ratesPercent,
    lowConfidenceForecast: f.lowConfidenceForecast,
  });
}
