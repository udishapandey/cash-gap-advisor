// True cost of each way to cover a cash gap, and the cheapest plan. Plain TypeScript, no AI.
// Options are ranked by actual ₹ paid per ₹1 raised, never by a fixed order.

import { CONFIG } from "./config";
import { amountDueOn, type ScenarioResult } from "./gap";
import { formatINR } from "../format";
import type { Merchant } from "../data/merchant";
import type { Invoice } from "../data/invoice";

export type OptionId =
  | "early_settlement"
  | "credit_line"
  | "bank_overdraft"
  | "split_order"
  | "supplier_extension";

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
  covered: number;
  uncovered: number;
  totalCost: number;
  borrowed: number;
}

export interface DiscountAnalysis {
  discountAmount: number; // ₹ saved by paying within the discount window
  daysEarly: number;
  /** Extra funding cost of paying early (bigger gap earlier) compared with paying on the due date. */
  extraFundingCost: number;
  netSaving: number;
  /** False if even every source together can't cover the earlier, bigger gap. */
  affordable: boolean;
  worthIt: boolean;
}

export interface FundingInput {
  merchant: Merchant;
  invoice: Invoice;
  /** The scenario (at the day we pay) whose "earned but not yet settled" cash caps early settlement. */
  scenario: ScenarioResult;
  overdraftRatePct?: number;
  /** True if the supplier has already agreed to an extension at no charge. */
  supplierAgrees?: boolean;
  /** Days borrowed money stays out. Defaults to CONFIG.borrowDays. */
  borrowDays?: number;
  /** Paying early means asking for an extension makes no sense, so it is left out. */
  forEarlyPayment?: boolean;
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

export function buildFundingOptions(input: FundingInput): FundingOption[] {
  const { merchant, invoice, scenario } = input;
  const overdraftRatePct = input.overdraftRatePct ?? CONFIG.overdraftRatePct;
  const borrowDays = input.borrowDays ?? CONFIG.borrowDays;
  const supplierAgrees = input.supplierAgrees ?? false;

  const earlySettlementCap = round(scenario.earnedNotSettled);
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
      maxAmount: round(invoice.amount * CONFIG.maxSplitShareOfInvoice),
      costRate: 0,
      annualisedPct: 0,
      isBorrowing: false,
      note: "No interest. Part of the stock ships later, so the best sellers may run out before the festival.",
    },
  ];

  if (!input.forEarlyPayment) {
    const lateFeeRate = supplierAgrees
      ? 0
      : (invoice.lateFeePctPerMonth / 100) * (CONFIG.extensionDays / CONFIG.daysPerMonth);
    options.push({
      id: "supplier_extension",
      name: "Ask supplier for more time",
      maxAmount: invoice.amount,
      costRate: lateFeeRate,
      annualisedPct: supplierAgrees ? 0 : invoice.lateFeePctPerMonth * 12,
      isBorrowing: false,
      note: supplierAgrees
        ? `Agreed: no charge for ${CONFIG.extensionDays} extra days.`
        : `Free if the supplier agrees. If not, the late fee is ${invoice.lateFeePctPerMonth}% a month. Priced here at the late fee for ${CONFIG.extensionDays} days.`,
    });
  }

  return options.sort(
    (a, b) => a.costRate - b.costRate || Number(a.isBorrowing) - Number(b.isBorrowing),
  );
}

/** Use the cheapest sources first, by actual cost, until the gap is covered. */
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

  const covered = gap - remaining;
  return {
    gap,
    steps,
    covered,
    uncovered: remaining,
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
  const affordable = earlyPlan.uncovered === 0;
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
