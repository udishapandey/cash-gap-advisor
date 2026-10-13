// The ways to find the money, and the plan built from them. Plain TypeScript, no AI. All amounts in ₹.
//
// The plan itself comes from the day-by-day planner in plan.ts. This file turns its result into the shapes the screens use:
// the plan's steps (your own cash, then the loans, then instant settlement only if it was genuinely used) and the table of
// every option. Asking the supplier for more time is never counted as certain, so it is not here: see `askFirst` in index.ts.

import { CONFIG } from "./config";
import { amountDueOn } from "./gap";
import { bestPlan, type PlanSim, type SourceId, type Terms } from "./plan";
import { expectedLostMargin, type StockOutRisk } from "./stock";
import type { CashSeries } from "./gap";
import type { Invoice } from "../data/invoice";

export type OptionId = "own_cash" | "bank_overdraft" | "credit_line" | "early_settlement" | "split_order";

export interface FundingOption {
  id: OptionId;
  name: string;
  /** The most this source can give. */
  maxAmount: number;
  /** Yearly rate for the two loans. Null for the rest: instant settlement is a flat fee, not a yearly rate. */
  annualisedPct: number | null;
  isBorrowing: boolean;
  /** Only for the split order: how the stock-out risk was priced. */
  stockOut?: StockOutRisk;
  note: string;
  /** What it does if it is the only source used (with the founder's own cash first). Null for the split order. */
  solo: { covers: number; cost: number; feasible: boolean; days: number } | null;
}

export interface PlanStep {
  optionId: OptionId;
  name: string;
  /** The most outstanding (the cash used, for your own cash). */
  amount: number;
  /** Interest paid, or the fee for instant settlement. Zero for your own cash. */
  cost: number;
  isBorrowing: boolean;
  note: string;
  /** Days something was outstanding. Null for your own cash. */
  days: number | null;
  /** The day it was repaid. Null if it was never drawn, or is still owed. */
  closedDay: number | null;
}

export interface Plan {
  payDay: number;
  payAmount: number;
  /** The most the account would fall below the safety buffer with nothing borrowed: the cash to find. */
  gap: number;
  steps: PlanStep[];
  /** The part of the gap that sources could cover. */
  covered: number;
  uncovered: number;
  fullyCovered: boolean;
  /** Interest and fees over the life of the plan. */
  totalCost: number;
  /** The most owed on the overdraft and credit line together. */
  borrowed: number;
  /** The founder's own cash used, above the safety buffer. */
  ownCash: number;
  buffer: number;
  /** The day all loans were back to zero. Null if nothing was borrowed. */
  closedDay: number | null;
  /** The day-by-day run for the expected sales, and for the low sales (same sources in the same order). */
  sim: PlanSim;
  simLow: PlanSim;
}

export interface DiscountAnalysis {
  discountAmount: number; // ₹ saved by paying within the discount window
  daysEarly: number;
  /** Extra interest and fees of paying early (a bigger gap sooner) compared with paying on the due date. Can be negative. */
  extraFundingCost: number;
  netSaving: number;
  /** True if paying early is feasible and the slow-sales case is still covered. */
  affordable: boolean;
  worthIt: boolean;
}

const round = (n: number) => Math.round(n);

export const OPTION_NAMES: Record<OptionId, string> = {
  own_cash: "Your cash",
  bank_overdraft: "Bank overdraft",
  credit_line: "Credit line",
  early_settlement: "Instant settlement",
  split_order: "Split the order",
};

/** The late fee if the due date is missed by `daysLate`. Shown as a cost of missing it, never as a plan. */
export function lateFeeIfMissed(invoice: Invoice, daysLate: number): number {
  return round(((invoice.amount * invoice.lateFeePctPerMonth) / 100) * (daysLate / CONFIG.daysPerMonth));
}

const STEP_ORDER: OptionId[] = ["own_cash", "bank_overdraft", "credit_line", "early_settlement"];

/** The plan as the screens show it: your own cash first, then each source that was really used. */
export function planFromSim(sim: PlanSim, simLow: PlanSim, gap: number): Plan {
  const steps: PlanStep[] = [];
  if (sim.ownCashUsed > 0) {
    steps.push({ optionId: "own_cash", name: OPTION_NAMES.own_cash, amount: sim.ownCashUsed, cost: 0, isBorrowing: false, note: "Cash already in your account, above the safety buffer.", days: null, closedDay: null });
  }
  for (const id of ["bank_overdraft", "credit_line", "early_settlement"] as SourceId[]) {
    const s = sim.stats[id];
    if (s.drawn <= 0) continue;
    steps.push({
      optionId: id,
      name: OPTION_NAMES[id],
      amount: round(s.peak),
      cost: round(s.cost),
      isBorrowing: id !== "early_settlement",
      note: id === "early_settlement" ? "A flat fee each time, on your own sales money." : "Interest per day on what is used, repaid as cash arrives.",
      days: s.days,
      closedDay: s.closedDay,
    });
  }
  steps.sort((a, b) => STEP_ORDER.indexOf(a.optionId) - STEP_ORDER.indexOf(b.optionId));
  const uncovered = Math.min(gap, sim.uncoveredPeak);
  return {
    payDay: sim.payDay,
    payAmount: sim.payAmount,
    gap,
    steps,
    covered: gap - uncovered,
    uncovered,
    fullyCovered: sim.feasible,
    totalCost: round(sim.totalCost),
    borrowed: sim.peakBorrowed,
    ownCash: sim.ownCashUsed,
    buffer: sim.buffer,
    closedDay: sim.closedDay,
    sim,
    simLow,
  };
}

export interface OptionsInput {
  series: CashSeries;
  terms: Terms;
  payDay: number;
  payAmount: number;
  horizon: number;
  /** Pairs on the order, the unit price, and the forecast demand: they price the split order. */
  invoice: Invoice;
  demandUnits: number;
}

/** Every way of finding the money, each tried alone (with your own cash first), for the table that compares them. */
export function buildOptions(input: OptionsInput): FundingOption[] {
  const { series, terms, payDay, payAmount, horizon, invoice } = input;
  const solo = (id: SourceId) => {
    const sim = bestPlan({ series, payDay, payAmount, terms, horizon, allowed: [id] });
    return { covers: round(sim.stats[id].peak), cost: round(sim.totalCost), feasible: sim.feasible, days: sim.stats[id].days };
  };
  const earned = Math.max(0, ...series.earnedNotSettled.slice(0, payDay + 1));
  const splitUnits = round(invoice.units * CONFIG.maxSplitShareOfInvoice);
  const splitAmount = splitUnits * invoice.unitPrice;
  const risk = expectedLostMargin({ orderUnits: invoice.units, unitsNotOrdered: splitUnits, demandUnits: input.demandUnits });

  return [
    {
      id: "bank_overdraft",
      name: OPTION_NAMES.bank_overdraft,
      maxAmount: terms.overdraft.limit,
      annualisedPct: terms.overdraft.ratePct,
      isBorrowing: true,
      note: `${terms.overdraft.ratePct}% a year, interest per day on what you use, repayable any time.`,
      solo: solo("bank_overdraft"),
    },
    {
      id: "credit_line",
      name: OPTION_NAMES.credit_line,
      maxAmount: terms.creditLine.limit,
      annualisedPct: terms.creditLine.ratePct,
      isBorrowing: true,
      note: `${terms.creditLine.ratePct}% a year, interest per day on what you withdraw, no pre-closure charge.`,
      solo: solo("credit_line"),
    },
    {
      id: "early_settlement",
      name: OPTION_NAMES.early_settlement,
      maxAmount: round(Math.min(earned, terms.instant.limitPerDay)),
      annualisedPct: null,
      isBorrowing: false,
      note: `A flat ${terms.instant.feePct.toFixed(3)}% of the amount, fee and GST, each time. Your own sales money.`,
      solo: solo("early_settlement"),
    },
    {
      id: "split_order",
      name: OPTION_NAMES.split_order,
      maxAmount: splitAmount,
      annualisedPct: null,
      isBorrowing: false,
      stockOut: risk,
      note: `Delivers ${splitUnits} pairs later. The cost is the expected lost margin on the pairs that would have sold.`,
      solo: null,
    },
  ];
}

/** Is it worth paying early for the discount, after paying for the extra cash that needs? */
export function evaluateDiscount(invoice: Invoice, duePlan: Plan, earlyPlan: Plan): DiscountAnalysis {
  const discountAmount = round(invoice.amount - amountDueOn(invoice, invoice.earlyPayWithinDays));
  const extraFundingCost = earlyPlan.totalCost - duePlan.totalCost;
  // Paying early is only sound if the plan is feasible and the slow-sales case is still covered by unused credit.
  const affordable = earlyPlan.fullyCovered && earlyPlan.simLow.feasible;
  const netSaving = discountAmount - extraFundingCost;
  return {
    discountAmount,
    daysEarly: invoice.dueInDays - invoice.earlyPayWithinDays,
    extraFundingCost,
    netSaving,
    affordable,
    worthIt: affordable && netSaving > 0,
  };
}
