// True cost of each way to cover a cash gap, and the cheapest plan. Plain TypeScript, no AI.
// Options are ranked by actual ₹ paid per ₹1 raised, never by a fixed order.
//
// Only CONFIRMED sources are in here: early settlement, credit line, bank overdraft, and
// ordering fewer pairs. Asking the supplier for more time is never counted as certain, so it
// is not an option here. See `askFirst` in index.ts.

import { CONFIG } from "./config";
import { amountDueOn, type ScenarioResult } from "./gap";
import { expectedLostMargin, type StockOutRisk } from "./stock";
import { formatINR } from "../format";
import type { Merchant } from "../data/merchant";
import type { Invoice } from "../data/invoice";

export type OptionId = "early_settlement" | "credit_line" | "bank_overdraft" | "split_order";

export interface FundingOption {
  id: OptionId;
  name: string;
  /** The most this source can give us. */
  maxAmount: number;
  /** ₹ actually paid per ₹1 raised, over the time the money is used. The ranking key. */
  costRate: number;
  /** Cost expressed as % per year, for comparison with loans. null if it doesn't make sense. */
  annualisedPct: number | null;
  isBorrowing: boolean;
  /** Only for the split order: how the stock-out risk was priced. */
  stockOut?: StockOutRisk;
  note: string;
}

export interface PlanStep {
  optionId: OptionId;
  name: string;
  amount: number;
  cost: number;
  isBorrowing: boolean;
  note: string;
}

export interface Plan {
  gap: number;
  steps: PlanStep[];
  /** Covered by confirmed sources. Never includes a supplier extension. */
  covered: number;
  uncovered: number;
  fullyCovered: boolean;
  totalCost: number;
  /** Credit line + overdraft. */
  borrowed: number;
}

export interface DiscountAnalysis {
  discountAmount: number; // ₹ saved by paying within the discount window
  daysEarly: number;
  /** Extra funding cost of paying early (bigger gap earlier) compared with paying on the due date. */
  extraFundingCost: number;
  netSaving: number;
  /** False if even every confirmed source together can't cover the earlier, bigger gap. */
  affordable: boolean;
  worthIt: boolean;
}

export interface FundingInput {
  merchant: Merchant;
  /** The invoice being paid (already resized if the order was right-sized). */
  invoice: Invoice;
  /** The scenario (at the day we pay) whose "earned but not yet settled" cash caps early settlement. */
  scenario: ScenarioResult;
  /** Pairs forecast to sell this season in the plan scenario. Prices the split order's stock-out risk. */
  demandUnits: number;
  overdraftRatePct?: number;
  /** Days borrowed money stays out. Defaults to CONFIG.borrowDays. */
  borrowDays?: number;
}

const round = (n: number) => Math.round(n);

/** Fee for getting money `daysAdvanced` earlier, expressed per year. 0.30% for 2 days = 54.75%. */
export function annualisedPct(feePct: number, daysAdvanced: number): number {
  return (feePct * CONFIG.daysPerYear) / daysAdvanced;
}

/** Interest on ₹1 borrowed at `ratePct` per year for `days` days (simple interest). */
export function interestRate(ratePct: number, days: number): number {
  return (ratePct / 100) * (days / CONFIG.daysPerYear);
}

/** The late fee if the due date is missed by `daysLate`. Shown as a cost of missing it, never as a plan. */
export function lateFeeIfMissed(invoice: Invoice, daysLate: number): number {
  return round(
    ((invoice.amount * invoice.lateFeePctPerMonth) / 100) * (daysLate / CONFIG.daysPerMonth),
  );
}

export function buildFundingOptions(input: FundingInput): FundingOption[] {
  const { merchant, invoice, scenario } = input;
  const overdraftRatePct = input.overdraftRatePct ?? CONFIG.overdraftRatePct;
  const borrowDays = input.borrowDays ?? CONFIG.borrowDays;

  const earlySettlementCap = round(scenario.earnedNotSettled);

  // Split order: defer some pairs to a later delivery. The cost is the margin on the
  // deferred pairs that would have sold.
  const splitUnits = round(invoice.units * CONFIG.maxSplitShareOfInvoice);
  const splitAmount = splitUnits * invoice.unitPrice;
  const risk = expectedLostMargin({
    orderUnits: invoice.units,
    unitsNotOrdered: splitUnits,
    demandUnits: input.demandUnits,
  });

  const options: FundingOption[] = [
    {
      id: "early_settlement",
      name: "Early settlement",
      maxAmount: earlySettlementCap,
      costRate: CONFIG.earlySettlementFeePct / 100,
      annualisedPct: annualisedPct(CONFIG.earlySettlementFeePct, merchant.settlementDays),
      isBorrowing: false,
      note: `Your own prepaid sales money, ${merchant.settlementDays} days early. Not a loan. Capped at sales already earned (${formatINR(earlySettlementCap)}).`,
    },
    {
      id: "credit_line",
      name: "Credit line",
      maxAmount: merchant.creditLineLimit,
      costRate: interestRate(CONFIG.creditLineRatePct, borrowDays),
      annualisedPct: CONFIG.creditLineRatePct,
      isBorrowing: true,
      note: `${CONFIG.creditLineRatePct}% a year, assumed out for ${borrowDays} days. Simulated pre-approved limit.`,
    },
    {
      id: "bank_overdraft",
      name: "Your bank overdraft",
      maxAmount: merchant.overdraftLimit,
      costRate: interestRate(overdraftRatePct, borrowDays),
      annualisedPct: overdraftRatePct,
      isBorrowing: true,
      note: `${overdraftRatePct}% a year (editable), assumed out for ${borrowDays} days.`,
    },
    {
      id: "split_order",
      name: "Split the order",
      maxAmount: splitAmount,
      costRate: splitAmount > 0 ? risk.expectedLostMargin / splitAmount : 0,
      annualisedPct: null,
      isBorrowing: false,
      stockOut: risk,
      note: `Delivers ${splitUnits} pairs later. No interest, but the forecast says ${Math.round(risk.probabilitySell * 100)}% of those pairs would sell, so the expected lost margin is ${formatINR(risk.expectedLostMargin)} (pairs × chance they sell × ${formatINR(risk.marginPerUnit)} margin).`,
    },
  ];

  return options.sort(
    (a, b) => a.costRate - b.costRate || Number(a.isBorrowing) - Number(b.isBorrowing),
  );
}

/** Use the cheapest confirmed sources first, by actual cost, until the gap is covered. */
export function buildPlan(gap: number, options: FundingOption[], exclude: OptionId[] = []): Plan {
  const ranked = options
    .filter((o) => !exclude.includes(o.id))
    .sort((a, b) => a.costRate - b.costRate || Number(a.isBorrowing) - Number(b.isBorrowing));

  let remaining = gap;
  const steps: PlanStep[] = [];
  for (const option of ranked) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, option.maxAmount);
    if (amount <= 0) continue;
    steps.push({
      optionId: option.id,
      name: option.name,
      amount,
      cost: round(amount * option.costRate),
      isBorrowing: option.isBorrowing,
      note: option.note,
    });
    remaining -= amount;
  }

  return {
    gap,
    steps,
    covered: gap - remaining,
    uncovered: remaining,
    fullyCovered: remaining === 0,
    totalCost: steps.reduce((s, x) => s + x.cost, 0),
    borrowed: steps.filter((s) => s.isBorrowing).reduce((s, x) => s + x.amount, 0),
  };
}

/** Is it worth paying early for the discount, after paying for the extra cash that needs? */
export function evaluateDiscount(
  invoice: Invoice,
  duePlan: Plan,
  earlyPlan: Plan,
): DiscountAnalysis {
  const discountAmount = round(invoice.amount - amountDueOn(invoice, invoice.earlyPayWithinDays));
  const extraFundingCost = earlyPlan.totalCost - duePlan.totalCost;
  const affordable = earlyPlan.fullyCovered;
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
