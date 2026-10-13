// After the season: how did the approved plan do? Plain TypeScript, no AI. All amounts in ₹.
//
// Takes the approved plan plus a SIMULATED actual outcome (sales and COD returns). The plan and the founder's usual way are
// each run again, day by day, on the cash that really came in, so the costs are what each would really have cost:
//   - actual sales against the forecast range, and the pairs sold and left over
//   - money saved = the usual way's cost minus the plan's cost (the discount counts for the plan): the headline saving
//   - the cash to find, forecast against actual
//   - what the system learned: a better festive-uplift estimate and COD return rate.
// And a mid-season re-plan: halfway through, with sales running above or below the forecast, what would change.

import type { Merchant } from "../data/merchant";
import { CONFIG } from "./config";
import { cashSeries, computeGap } from "./gap";
import type { ViewResult } from "./index";
import { bestPlan, simulate, type PlanSim } from "./plan";
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
 * SIMULATED. Nothing here was observed. Weaker sales come with more COD returns, stronger sales with fewer, and
 * "as forecast" returns exactly the rate the forecast assumed. See docs/ASSUMPTIONS.md.
 */
export const SIMULATED_OUTCOMES: Record<OutcomeId, SimulatedOutcome> = {
  as_forecast: { id: "as_forecast", label: "Sales as forecast", salesVsForecast: 1, codReturnRate: 0.3 },
  lower_15: { id: "lower_15", label: "15% lower", salesVsForecast: 0.85, codReturnRate: 0.35 },
  higher_15: { id: "higher_15", label: "15% higher", salesVsForecast: 1.15, codReturnRate: 0.27 },
};

// ---------- Inputs and result ----------

export interface OutcomeInput {
  /** The plan the founder approved (the chosen view, with its recommended timing and plan). */
  approved: ViewResult;
  /** The same invoice with the full order: what the founder would have paid without ordering fewer pairs. */
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
  };
  stock: {
    ordered: number;
    sold: number;
    leftOver: number;
    /** Pairs customers wanted that the order did not cover. */
    missedPairs: number;
  };
  cost: {
    /** The plan, run again on the cash that really came in. */
    plan: { fundsCost: number; discountCaptured: number; netCost: number };
    /** The usual way: pay on the due date, no discount, any shortfall on the credit line, repaid as cash arrives. */
    default: {
      /** The most it had to borrow. */
      amount: number;
      /** What its credit line could not cover. Zero means it was fully covered. */
      uncovered: number;
      coversWholeGap: boolean;
      fundsCost: number;
      netCost: number;
    };
    /** default.netCost - plan.netCost, exactly. Positive means the plan was cheaper. */
    moneySaved: number;
    /** moneySaved = fromCheaperFunding + discountCaptured, exactly. */
    fromCheaperFunding: number;
  };
  /** The cash to find: the forecast against what it turned out to be. */
  gap: { forecast: number; actual: number; difference: number };
  borrowing: {
    /** The most owed at once (overdraft and credit line), as planned and as it turned out. */
    planned: number;
    actual: number;
    /** Credit drawn beyond the plan: from the backup, the unused credit line. */
    extraCredit: number;
    /** What even the backup could not cover. */
    beyondBackup: number;
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

/** The days to simulate for a plan: to the due date, any extra days asked for, and the repayment horizon. */
export const horizonFor = (view: ViewResult) => view.invoice.dueInDays + CONFIG.extensionDays + CONFIG.repaymentHorizonDays;

/** The cash path on the actual sales and COD returns. */
function actualSeries(input: Pick<OutcomeInput, "merchant" | "salesDropPercent" | "cashElsewhere" | "actual">, horizon: number) {
  return cashSeries({
    merchant: { ...input.merchant, codReturnRate: input.actual.codReturnRate },
    scenario: "expected",
    salesDropPercent: input.salesDropPercent,
    salesVsForecast: input.actual.salesVsForecast,
    cashElsewhere: input.cashElsewhere,
    horizon,
  });
}

export function computeOutcome(input: OutcomeInput): OutcomeResult {
  const { approved, fullOrder, stock, merchant, salesDropPercent, cashElsewhere, actual } = input;
  const plan = approved.recommended.plan;
  const early = approved.recommended.timing === "pay_early_for_discount";
  const horizon = horizonFor(approved);
  const series = actualSeries(input, horizon);

  // --- Sales: actual against the forecast range ---
  const d = stock.demandByScenario;
  const actualPairs = d.expected * actual.salesVsForecast;
  const sales: OutcomeResult["sales"] = {
    forecastPairs: { low: round(d.low), expected: round(d.expected), high: round(d.high) },
    actualPairs: round(actualPairs),
    vsForecastPercent: round1((actual.salesVsForecast - 1) * 100),
    insideRange: actualPairs >= d.low && actualPairs <= d.high,
  };

  // --- Stock: what sold and what is left ---
  const ordered = approved.units;
  const sold = Math.min(ordered, Math.floor(actualPairs));
  const stockResult: OutcomeResult["stock"] = {
    ordered,
    sold,
    leftOver: ordered - sold,
    missedPairs: Math.max(0, Math.floor(actualPairs) - ordered),
  };

  // --- Cost of funds: the plan and the usual way, each run again on the cash that really came in ---
  const planned = simulate({ series, payDay: plan.payDay, payAmount: plan.payAmount, order: plan.sim.order, terms: approved.terms, horizon });
  const usual = simulate({
    series,
    payDay: fullOrder.invoice.dueInDays,
    payAmount: round(fullOrder.invoice.amount),
    order: ["credit_line"],
    terms: fullOrder.terms,
    horizon,
  });
  const fundsCost = round(planned.totalCost);
  const discountCaptured = early ? approved.discount.discountAmount : 0;
  const defaultCost = round(usual.totalCost);
  const cost: OutcomeResult["cost"] = {
    plan: { fundsCost, discountCaptured, netCost: fundsCost - discountCaptured },
    default: {
      amount: usual.peakBorrowed,
      uncovered: usual.uncoveredPeak,
      coversWholeGap: usual.feasible,
      fundsCost: defaultCost,
      netCost: defaultCost,
    },
    moneySaved: defaultCost - (fundsCost - discountCaptured),
    fromCheaperFunding: defaultCost - fundsCost,
  };

  // --- The cash to find, forecast against actual ---
  const actualGap = computeGap({
    merchant: { ...merchant, codReturnRate: actual.codReturnRate },
    invoice: approved.invoice,
    salesDropPercent,
    salesVsForecast: actual.salesVsForecast,
    byDay: plan.payDay,
    cashElsewhere,
  }).scenarios.expected.gap;
  const gap = { forecast: plan.gap, actual: actualGap, difference: actualGap - plan.gap };

  // --- Borrowing: as planned and as it turned out ---
  const extraCredit = Math.max(0, round(planned.stats.credit_line.peak - plan.sim.stats.credit_line.peak));
  const borrowing: OutcomeResult["borrowing"] = {
    planned: plan.borrowed,
    actual: planned.peakBorrowed,
    extraCredit,
    beyondBackup: planned.uncoveredPeak,
  };

  // --- What the system learned: move each estimate part of the way toward what was observed ---
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

  return { sales, stock: stockResult, cost, gap, borrowing, learned };
}

// ---------- The mid-season re-plan ----------

export interface MidSeasonChange {
  kind: "withdraw_credit" | "draw_overdraft" | "repay_later" | "repay_earlier" | "backup_used" | "uncovered";
  /** The day it happens (a day count from the invoice date), where that applies. */
  day?: number;
  amount?: number;
  from?: number;
  to?: number;
}

export interface MidSeason {
  day: number;
  /** Sales so far against the forecast, as a signed %: -15 means 15% below. */
  vsForecastPercent: number;
  /** Cash from sales (prepaid and COD) that came in by this day: the forecast, and what it turned out to be. */
  cashInForecast: number;
  cashInActual: number;
  /** The cash to find: the forecast, and now that real sales are known. */
  forecastGap: number;
  updatedGap: number;
  changes: MidSeasonChange[];
  nothingChanges: boolean;
}

const firstDayAbove = (debtByDay: number[], threshold: number): number | undefined => {
  const i = debtByDay.findIndex((v) => v > threshold + 1);
  return i < 0 ? undefined : i;
};

/**
 * Halfway through, real sales are in. Run the plan again on the cash path they imply (the shortfall in sales carries on)
 * and say exactly what changes: more credit drawn, on which day, repayments moved, the backup used.
 */
export function midSeasonCheck(input: OutcomeInput, day = 15): MidSeason {
  const { approved, merchant, actual } = input;
  const plan = approved.recommended.plan;
  const horizon = horizonFor(approved);
  const forecastSeries = cashSeries({ merchant, scenario: "expected", salesDropPercent: input.salesDropPercent, cashElsewhere: input.cashElsewhere, horizon });
  const series = actualSeries(input, horizon);
  const inflowBy = (s: { balance: number[] }) => round(s.balance[day] - s.balance[0] + merchant.otherOutflowsPerDay * day);

  // The plan, worked out again for the new cash path: the cheapest safe order for what is now expected.
  const replan: PlanSim = bestPlan({ series, payDay: plan.payDay, payAmount: plan.payAmount, terms: approved.terms, horizon });
  const before = plan.sim;
  const changes: MidSeasonChange[] = [];

  const more = (id: "credit_line" | "bank_overdraft") => round(replan.stats[id].peak - before.stats[id].peak);
  const moreCredit = more("credit_line");
  const moreOverdraft = more("bank_overdraft");
  if (moreCredit > 0) {
    changes.push({ kind: "withdraw_credit", amount: moreCredit, day: firstDayAbove(replan.debtByDay, before.peakBorrowed) ?? replan.stats.credit_line.firstDay ?? undefined });
    const unused = Math.max(0, approved.terms.creditLine.limit - before.stats.credit_line.peak);
    changes.push({ kind: "backup_used", amount: Math.min(moreCredit, round(unused)) });
  }
  if (moreOverdraft > 0) changes.push({ kind: "draw_overdraft", amount: moreOverdraft });
  if (before.closedDay !== null && replan.closedDay !== null && replan.closedDay !== before.closedDay) {
    changes.push({ kind: replan.closedDay > before.closedDay ? "repay_later" : "repay_earlier", from: before.closedDay, to: replan.closedDay });
  }
  if (!replan.feasible) changes.push({ kind: "uncovered", amount: replan.uncoveredPeak });

  const updatedGap = computeGap({
    merchant: { ...merchant, codReturnRate: actual.codReturnRate },
    invoice: approved.invoice,
    salesDropPercent: input.salesDropPercent,
    salesVsForecast: actual.salesVsForecast,
    byDay: plan.payDay,
    cashElsewhere: input.cashElsewhere,
  }).scenarios.expected.gap;

  return {
    day,
    vsForecastPercent: round1((actual.salesVsForecast - 1) * 100),
    cashInForecast: inflowBy(forecastSeries),
    cashInActual: inflowBy(series),
    forecastGap: plan.gap,
    updatedGap,
    changes,
    nothingChanges: changes.length === 0,
  };
}
