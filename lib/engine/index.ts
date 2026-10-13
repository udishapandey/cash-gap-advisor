// One call that runs the whole engine. Change any input (e.g. salesDropPercent) and everything reruns.
//
// The engine pays the supplier on one of two days: the discount deadline (paying the smaller amount) or the due date.
// For each, the planner works out day by day how to fund it, and the cheaper safe one is recommended.
// The plan uses confirmed sources only. A supplier extension is never in the plan; it comes back separately as `askFirst`.
//
// Two views are returned. keepFull is the whole order and is always the recommendation. rightSized (only the pairs the
// forecast says will sell) is kept for the options table: ordering fewer pairs is not part of paying the supplier.

import { CONFIG, type Scenario } from "./config";
import { amountDueOn, cashSeries, computeGap, type GapResult } from "./gap";
import {
  buildOptions,
  evaluateDiscount,
  lateFeeIfMissed,
  planFromSim,
  type DiscountAnalysis,
  type FundingOption,
  type OptionId,
  type Plan,
} from "./options";
import { bestPlan, simulate, SOURCE_IDS, termsFor, type SourceId, type Terms } from "./plan";
import { demandUnits, rightSize, withUnits, type RightSizing } from "./stock";
import type { Merchant } from "../data/merchant";
import type { Invoice } from "../data/invoice";

export interface EngineInput {
  merchant: Merchant;
  invoice: Invoice;
  /** What-if: forecast sales are this % lower. 0 = no change. */
  salesDropPercent?: number;
  /** Cash the founder has available elsewhere (another account, savings). Default 0. */
  cashElsewhere?: number;
  /** Which sales scenario the plan and the order size are built for. Default: expected. */
  planScenario?: Scenario;
  overdraftRatePct?: number;
  /** Options the founder doesn't want in the plan. */
  exclude?: OptionId[];
  /** Extra days to ask the supplier for. Default: CONFIG.extensionDays. */
  extensionDays?: number;
}

export type Timing = "on_due_date" | "pay_early_for_discount";
export type ViewId = "keep_full" | "right_sized";

/** What happens IF the supplier agrees. Not part of the plan and never counted as cash. */
export interface AskFirst {
  extraDays: number;
  /** The cash to find if the bill is paid on the extended due date. */
  gapAtExtendedDate: number;
  planAtExtendedDate: Plan;
  borrowingIfPaidOnDueDate: number;
  borrowingIfExtended: number;
  /** How much less you would borrow. 0 if the extra days don't help. */
  borrowingRemoved: number;
  /** The cost of simply missing the due date by those days. A warning, never a recommendation. */
  lateFeeIfMissed: number;
}

export interface ViewResult {
  id: ViewId;
  units: number;
  orderValue: number;
  invoice: Invoice;
  /** The cash to find if the bill is paid on the due date. */
  gap: GapResult;
  /** The cash to find if the bill is paid on the last day of the discount window. */
  earlyGap: GapResult;
  /** The same for the day the recommended plan pays: the "likely short" the founder sees. */
  focusGap: GapResult;
  /** The ways to find the money, each tried alone, for the day the recommended plan pays. */
  options: FundingOption[];
  duePlan: Plan;
  earlyPlan: Plan;
  discount: DiscountAnalysis;
  recommended: { timing: Timing; plan: Plan };
  /** The founder's usual way: pay on the due date, no discount, any shortfall on the credit line, repaid as cash arrives. */
  defaultPlan: Plan;
  /** The rates and limits this view was worked out with. */
  terms: Terms;
  /** The overdraft and credit line owed at most, in the recommended plan. */
  loan: number;
  askFirst: AskFirst;
}

export interface EngineResult {
  stock: RightSizing;
  views: { keepFull: ViewResult; rightSized: ViewResult };
  /** Always the whole order: ordering fewer pairs is not part of paying the supplier. */
  recommendedView: ViewId;
  recommended: ViewResult;
}

function computeView(id: ViewId, invoice: Invoice, input: EngineInput, planScenario: Scenario): ViewResult {
  const { merchant } = input;
  const salesDropPercent = input.salesDropPercent ?? 0;
  const dueDay = invoice.dueInDays;
  const earlyDay = Math.min(invoice.earlyPayWithinDays, dueDay);
  const hasDiscount = invoice.earlyPayDiscountPct > 0 && earlyDay < dueDay;
  const extraDays = input.extensionDays ?? CONFIG.extensionDays;
  const terms = termsFor(merchant, input.overdraftRatePct);
  const horizon = dueDay + extraDays + CONFIG.repaymentHorizonDays;
  const excluded = new Set(input.exclude ?? []);
  const allowed = SOURCE_IDS.filter((s) => !excluded.has(s as OptionId));

  const seriesFor = (scenario: Scenario) =>
    cashSeries({ merchant, scenario, salesDropPercent, cashElsewhere: input.cashElsewhere, horizon });
  const series = seriesFor(planScenario);
  const low = seriesFor("low");
  const gapAt = (byDay: number) => computeGap({ merchant, invoice, salesDropPercent, byDay, cashElsewhere: input.cashElsewhere });

  const planFor = (day: number, gap: GapResult, sources: SourceId[] = allowed): Plan => {
    const payAmount = Math.round(amountDueOn(invoice, day));
    const sim = bestPlan({ series, payDay: day, payAmount, terms, horizon, allowed: sources });
    const simLow = simulate({ series: low, payDay: day, payAmount, order: sim.order, terms, horizon });
    return planFromSim(sim, simLow, gap.scenarios[planScenario].gap);
  };

  const gap = gapAt(dueDay);
  const earlyGap = hasDiscount ? gapAt(earlyDay) : gap;
  const duePlan = planFor(dueDay, gap);
  const earlyPlan = hasDiscount ? planFor(earlyDay, earlyGap) : duePlan;
  const discount = hasDiscount
    ? evaluateDiscount(invoice, duePlan, earlyPlan)
    : { discountAmount: 0, daysEarly: dueDay - earlyDay, extraFundingCost: 0, netSaving: 0, affordable: false, worthIt: false };
  const recommended = discount.worthIt
    ? { timing: "pay_early_for_discount" as const, plan: earlyPlan }
    : { timing: "on_due_date" as const, plan: duePlan };
  const focusGap = recommended.timing === "pay_early_for_discount" ? earlyGap : gap;

  // The usual way: pay on the due date, no discount, any shortfall on the credit line.
  const defaultPlan = planFor(dueDay, gap, ["credit_line"]);

  // Ask first: what if the supplier agreed to N more days? Paid on the extended date, full amount.
  const extDay = dueDay + extraDays;
  const extGap = gapAt(extDay);
  const planAtExtendedDate = planFor(extDay, extGap);
  const askFirst: AskFirst = {
    extraDays,
    gapAtExtendedDate: extGap.scenarios[planScenario].gap,
    planAtExtendedDate,
    borrowingIfPaidOnDueDate: duePlan.borrowed,
    borrowingIfExtended: planAtExtendedDate.borrowed,
    borrowingRemoved: Math.max(0, duePlan.borrowed - planAtExtendedDate.borrowed),
    lateFeeIfMissed: lateFeeIfMissed(invoice, extraDays),
  };

  const options = buildOptions({
    series,
    terms,
    payDay: recommended.plan.payDay,
    payAmount: recommended.plan.payAmount,
    horizon,
    invoice,
    demandUnits: demandUnits(merchant, planScenario, salesDropPercent),
  });

  return {
    id,
    units: invoice.units,
    orderValue: invoice.amount,
    invoice,
    gap,
    earlyGap,
    focusGap,
    options,
    duePlan,
    earlyPlan,
    discount,
    recommended,
    defaultPlan,
    terms,
    loan: recommended.plan.borrowed,
    askFirst,
  };
}

export function runEngine(input: EngineInput): EngineResult {
  const planScenario = input.planScenario ?? "expected";
  const stock = rightSize(input.invoice, input.merchant, planScenario, input.salesDropPercent ?? 0);

  const keepFull = computeView("keep_full", input.invoice, input, planScenario);
  const rightSized = computeView("right_sized", withUnits(input.invoice, stock.recommendedUnits), input, planScenario);

  return { stock, views: { keepFull, rightSized }, recommendedView: "keep_full", recommended: keepFull };
}

export interface WhatIfRow {
  salesDropPercent: number;
  unsoldShare: number;
  recommendedView: ViewId;
  keepFull: { units: number; orderValue: number; gapExpected: number; loan: number; planCost: number };
  rightSized: { units: number; orderValue: number; gapExpected: number; loan: number; planCost: number };
}

/** Rerun the engine for each sales drop. */
export function runWhatIf(input: EngineInput, drops: number[] = [0, 10, 20, 30]): WhatIfRow[] {
  return drops.map((salesDropPercent) => {
    const r = runEngine({ ...input, salesDropPercent });
    const summary = (v: ViewResult) => ({
      units: v.units,
      orderValue: v.orderValue,
      gapExpected: v.focusGap.gapExpected,
      loan: v.loan,
      planCost: v.recommended.plan.totalCost,
    });
    return {
      salesDropPercent,
      unsoldShare: r.stock.unsoldShare,
      recommendedView: r.recommendedView,
      keepFull: summary(r.views.keepFull),
      rightSized: summary(r.views.rightSized),
    };
  });
}
