// After the season: how did the approved plan do? Plain TypeScript, no AI. All amounts in ₹.
//
// Takes the approved plan plus a SIMULATED actual outcome (sales and COD returns), and works out:
//   - actual sales against the forecast range, and the pairs sold and left over
//   - the cost of funds, against the founder's default: draw the whole gap on the credit line, pay on the due date
//   - money saved = default cost - plan cost (the north-star metric)
//   - unnecessary borrowing: borrowed beyond what the real peak need turned out to be (a guardrail), and the
//     opposite, if the plan left the real peak need uncovered
//   - what the system learned: a better festive-uplift estimate and COD return rate.

import type { Merchant } from "../data/merchant";
import { CONFIG } from "./config";
import { computeGap } from "./gap";
import type { ViewResult } from "./index";
import { standbyFor } from "./standby";
import type { RightSizing } from "./stock";

// ---------- The simulated outcomes the founder can pick ----------

export const OUTCOME_IDS = ["as_forecast", "lower_15", "higher_15"] as const;
export type OutcomeId = (typeof OUTCOME_IDS)[number];

export interface ActualOutcome {
  /** Actual festive sales as a multiple of the forecast the plan was built on. 1 = as forecast. */
  salesVsForecast: number;
  /** The share of COD orders that were really returned (0 to 1). */
  codReturnRate: number;
}

export interface SimulatedOutcome extends ActualOutcome {
  id: OutcomeId;
  label: string;
}

/**
 * SIMULATED. Nothing here was observed. Weaker sales come with more COD returns, stronger sales with fewer,
 * and "as forecast" returns exactly the rate the forecast assumed. See docs/ASSUMPTIONS.md.
 */
export const SIMULATED_OUTCOMES: Record<OutcomeId, SimulatedOutcome> = {
  as_forecast: { id: "as_forecast", label: "Sales as forecast", salesVsForecast: 1, codReturnRate: 0.2 },
  lower_15: { id: "lower_15", label: "15% lower", salesVsForecast: 0.85, codReturnRate: 0.25 },
  higher_15: { id: "higher_15", label: "15% higher", salesVsForecast: 1.15, codReturnRate: 0.18 },
};

// ---------- Inputs and result ----------

export interface OutcomeInput {
  /** The plan the founder approved (the chosen view, with its recommended timing and plan). */
  approved: ViewResult;
  /** The same invoice with the full order: what the founder would have paid without right-sizing. */
  fullOrder: ViewResult;
  stock: RightSizing;
  merchant: Merchant;
  /** The what-if the plan was built on. */
  salesDropPercent: number;
  cashElsewhere: number;
  actual: ActualOutcome;
}

export interface OutcomeResult {
  sales: {
    /** Pairs customers wanted in the forecast: low, expected and high scenarios. */
    forecastPairs: { low: number; expected: number; high: number };
    /** Pairs customers actually wanted. */
    actualPairs: number;
    /** Actual against the expected forecast, as a signed %: -12 means 12% below. */
    vsForecastPercent: number;
    insideRange: boolean;
    /** The same, in ₹ at the simulated selling price per pair. */
    forecastRupees: { low: number; expected: number; high: number };
    actualRupees: number;
  };
  stock: {
    ordered: number;
    sold: number;
    leftOver: number;
    /** Pairs customers wanted that the order did not cover. */
    missedPairs: number;
    /** Pairs that would have been left over had the full order been kept. */
    leftOverIfFullOrder: number;
  };
  cost: {
    /** fundsCost includes `topUpCost`: the credit-line cost of any real peak need the approved plan did not cover. */
    plan: { fundsCost: number; topUpCost: number; discountCaptured: number; netCost: number };
    /**
     * The default: draw the gap on the credit line up to its limit, then on the founder's bank overdraft for the rest,
     * and pay on the due date with no early-payment discount. It never draws more than a source's limit.
     */
    default: {
      /** The gap the default has to cover. */
      amount: number;
      credit: { amount: number; cost: number };
      overdraft: { amount: number; cost: number };
      /**
       * What neither source can cover. The default is always drawable (it never takes more than either limit), but
       * above the two limits together it cannot cover the whole gap. Its cost then covers only what it can draw, so
       * the saving shown is understated, never overstated.
       */
      uncovered: number;
      coversWholeGap: boolean;
      fundsCost: number;
      netCost: number;
      /** What the default is, in words, for the screen. */
      label: string;
    };
    /** default.netCost - plan.netCost, exactly. Positive means the plan was cheaper. */
    moneySaved: number;
    /** moneySaved = fromCheaperFunding + discountCaptured, exactly. */
    fromCheaperFunding: number;
  };
  borrowing: {
    borrowed: number;
    /** What the funding need really peaked at, once the actual sales and returns are known. */
    actualPeakNeed: number;
    plannedPeakNeed: number;
    /** Borrowed beyond the real peak need. The guardrail: this should stay small. */
    unnecessary: number;
    /** The real peak need that the plan did not cover. */
    underFunded: number;
    /** The part of that drawn from standby (unused credit-line headroom), and the part beyond even that. */
    drawnFromStandby: number;
    beyondStandby: number;
  };
  learned: {
    /** `vsEstimatePercent`: observed against the system's own 1.4x estimate, signed. */
    uplift: { before: number; observed: number; after: number; vsEstimatePercent: number };
    codReturnRate: { assumedPercent: number; observedPercent: number; updatedPercent: number };
  };
}

const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeOutcome(input: OutcomeInput): OutcomeResult {
  const { approved, fullOrder, stock, merchant, salesDropPercent, cashElsewhere, actual } = input;
  const price = CONFIG.stock.sellingPricePerPair;
  const plan = approved.recommended.plan;
  const early = approved.recommended.timing === "pay_early_for_discount";

  // --- Sales: actual against the forecast range ---
  const d = stock.demandByScenario;
  const actualPairs = d.expected * actual.salesVsForecast;
  const sales: OutcomeResult["sales"] = {
    forecastPairs: { low: round(d.low), expected: round(d.expected), high: round(d.high) },
    actualPairs: round(actualPairs),
    vsForecastPercent: round1((actual.salesVsForecast - 1) * 100),
    insideRange: actualPairs >= d.low && actualPairs <= d.high,
    forecastRupees: { low: round(d.low * price), expected: round(d.expected * price), high: round(d.high * price) },
    actualRupees: round(actualPairs * price),
  };

  // --- Stock: what sold and what is left ---
  const ordered = approved.units;
  const sold = Math.min(ordered, Math.floor(actualPairs));
  const stockResult: OutcomeResult["stock"] = {
    ordered,
    sold,
    leftOver: ordered - sold,
    missedPairs: Math.max(0, Math.floor(actualPairs) - ordered),
    leftOverIfFullOrder: Math.max(0, fullOrder.units - Math.floor(actualPairs)),
  };

  // --- Borrowing guardrail: re-measure the peak need with the actual sales and returns ---
  const actualConditions = {
    merchant: { ...merchant, codReturnRate: actual.codReturnRate },
    salesDropPercent,
    salesVsForecast: actual.salesVsForecast,
    cashElsewhere,
  };
  const payDay = early ? Math.min(approved.invoice.earlyPayWithinDays, approved.invoice.dueInDays) : approved.invoice.dueInDays;
  const actualPeakNeed = computeGap({ ...actualConditions, invoice: approved.invoice, byDay: payDay }).scenarios.expected.gap;
  const nonLoanFunding = plan.covered - plan.borrowed; // early settlement and the like: not borrowing
  const loanNeeded = Math.max(0, actualPeakNeed - nonLoanFunding);
  const borrowing: OutcomeResult["borrowing"] = {
    borrowed: plan.borrowed,
    actualPeakNeed,
    plannedPeakNeed: plan.gap,
    unnecessary: Math.max(0, plan.borrowed - loanNeeded),
    underFunded: Math.max(0, actualPeakNeed - plan.covered),
    drawnFromStandby: 0,
    beyondStandby: 0,
  };
  // A top-up at lower sales is drawn from standby: unused credit-line headroom, undrawn until needed.
  const standby = standbyFor(approved);
  borrowing.drawnFromStandby = Math.min(borrowing.underFunded, standby.headroom);
  borrowing.beyondStandby = borrowing.underFunded - borrowing.drawnFromStandby;

  // --- Cost of funds: the plan against drawing the whole gap on the credit line ---
  // The plan's loans and fees were fixed at approval, so its cost is the cost as approved, plus the credit-line cost
  // of topping up if the real peak need turned out bigger than the plan covered. The default is treated the same way:
  // it draws the forecast gap, and tops up if the real need was bigger. The early-payment discount is money the plan
  // earned; the default never takes it.
  const planCredit = (early ? approved.earlyOptions : approved.options).find((o) => o.id === "credit_line");
  const topUpCost = planCredit ? round(borrowing.underFunded * planCredit.costRate) : 0;
  const fundsCost = plan.totalCost + topUpCost;
  const discountCaptured = early ? approved.discount.discountAmount : 0;
  const planNet = fundsCost - discountCaptured;

  const creditLine = fullOrder.options.find((o) => o.id === "credit_line");
  const overdraftLine = fullOrder.options.find((o) => o.id === "bank_overdraft");
  const defaultActualNeed = computeGap({ ...actualConditions, invoice: fullOrder.invoice, byDay: fullOrder.invoice.dueInDays }).scenarios.expected.gap;
  const defaultGap = Math.max(fullOrder.duePlan.gap, defaultActualNeed);
  // Credit line first, up to its limit; the bank overdraft for the rest, up to its limit. Never more than either can give.
  const creditAmount = Math.min(defaultGap, creditLine?.maxAmount ?? 0);
  const overdraftAmount = Math.min(defaultGap - creditAmount, overdraftLine?.maxAmount ?? 0);
  const creditCost = round(creditAmount * (creditLine?.costRate ?? 0));
  const overdraftCost = round(overdraftAmount * (overdraftLine?.costRate ?? 0));
  const defaultCost = creditCost + overdraftCost;
  const uncovered = defaultGap - creditAmount - overdraftAmount;
  const cost: OutcomeResult["cost"] = {
    plan: { fundsCost, topUpCost, discountCaptured, netCost: planNet },
    default: {
      amount: defaultGap,
      credit: { amount: creditAmount, cost: creditCost },
      overdraft: { amount: overdraftAmount, cost: overdraftCost },
      uncovered,
      coversWholeGap: uncovered === 0,
      fundsCost: defaultCost,
      netCost: defaultCost,
      label: "Credit line up to its limit, then your bank overdraft for the rest, paid on the due date, with no early-payment discount",
    },
    moneySaved: defaultCost - planNet,
    fromCheaperFunding: defaultCost - fundsCost,
  };

  // --- What the system learned: move each estimate part of the way toward what was seen ---
  const alpha = CONFIG.learningRate;
  const before = CONFIG.scenarioUplift.expected;
  const observed = before * (1 - salesDropPercent / 100) * actual.salesVsForecast;
  const assumed = merchant.codReturnRate * 100;
  const seen = actual.codReturnRate * 100;
  const learned: OutcomeResult["learned"] = {
    uplift: {
      before,
      observed: round2(observed),
      after: round2(before + alpha * (observed - before)),
      vsEstimatePercent: round1((observed / before - 1) * 100),
    },
    codReturnRate: { assumedPercent: round1(assumed), observedPercent: round1(seen), updatedPercent: round1(assumed + alpha * (seen - assumed)) },
  };

  return { sales, stock: stockResult, cost, borrowing, learned };
}
