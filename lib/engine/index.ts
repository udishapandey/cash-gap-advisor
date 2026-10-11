// One call that runs the whole engine. Change any input (e.g. salesDropPercent) and everything reruns.
//
// Two views are always returned:
//   keepFull   - order every pair on the invoice. The gap grows as sales drop.
//   rightSized - order only the pairs the forecast says will sell. The order and loan shrink.
// The plan in each view uses confirmed sources only. A supplier extension is never in the
// plan; it comes back separately as `askFirst`.

import { CONFIG, type Scenario } from "./config";
import { computeGap, type GapResult } from "./gap";
import {
  buildFundingOptions,
  buildPlan,
  evaluateDiscount,
  lateFeeIfMissed,
  type DiscountAnalysis,
  type FundingOption,
  type OptionId,
  type Plan,
} from "./options";
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
  /** Gap measured on the extended due date, using the same confirmed sources. */
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
  gap: GapResult; // measured on the due date
  earlyGap: GapResult; // measured on the last day of the discount window
  options: FundingOption[];
  earlyOptions: FundingOption[];
  duePlan: Plan;
  earlyPlan: Plan;
  discount: DiscountAnalysis;
  recommended: { timing: Timing; plan: Plan };
  /** Credit line + overdraft in the recommended plan. */
  loan: number;
  askFirst: AskFirst;
}

export interface EngineResult {
  stock: RightSizing;
  views: { keepFull: ViewResult; rightSized: ViewResult };
  /** (b) right-sized when expected unsold stock is over 10% of the order, otherwise (a). */
  recommendedView: ViewId;
  recommended: ViewResult;
}

function computeView(
  id: ViewId,
  invoice: Invoice,
  input: EngineInput,
  planScenario: Scenario,
): ViewResult {
  const { merchant } = input;
  const salesDropPercent = input.salesDropPercent ?? 0;
  const earlyDay = Math.min(invoice.earlyPayWithinDays, invoice.dueInDays);
  const daysEarly = invoice.dueInDays - earlyDay;
  const demand = demandUnits(merchant, planScenario, salesDropPercent);
  // "Keep the full order" means no part of the order is deferred.
  const exclude: OptionId[] = [...(input.exclude ?? []), ...(id === "keep_full" ? (["split_order"] as OptionId[]) : [])];

  const common = { merchant, invoice, demandUnits: demand, overdraftRatePct: input.overdraftRatePct };
  const gapAt = (byDay?: number) =>
    computeGap({ merchant, invoice, salesDropPercent, byDay, cashElsewhere: input.cashElsewhere });

  const gap = gapAt();
  const earlyGap = gapAt(earlyDay);
  const options = buildFundingOptions({ ...common, scenario: gap.scenarios[planScenario] });
  const earlyOptions = buildFundingOptions({
    ...common,
    scenario: earlyGap.scenarios[planScenario],
    borrowDays: CONFIG.borrowDays + daysEarly, // money is needed that much sooner
  });
  const duePlan = buildPlan(gap.scenarios[planScenario].gap, options, exclude);
  const earlyPlan = buildPlan(earlyGap.scenarios[planScenario].gap, earlyOptions, exclude);
  const discount = evaluateDiscount(invoice, duePlan, earlyPlan);
  const recommended = discount.worthIt
    ? { timing: "pay_early_for_discount" as const, plan: earlyPlan }
    : { timing: "on_due_date" as const, plan: duePlan };

  // Ask first: what if the supplier agreed to N more days?
  const extraDays = input.extensionDays ?? CONFIG.extensionDays;
  const extGap = gapAt(invoice.dueInDays + extraDays);
  const extOptions = buildFundingOptions({ ...common, scenario: extGap.scenarios[planScenario] });
  const planAtExtendedDate = buildPlan(extGap.scenarios[planScenario].gap, extOptions, exclude);
  const askFirst: AskFirst = {
    extraDays,
    gapAtExtendedDate: extGap.scenarios[planScenario].gap,
    planAtExtendedDate,
    borrowingIfPaidOnDueDate: duePlan.borrowed,
    borrowingIfExtended: planAtExtendedDate.borrowed,
    borrowingRemoved: Math.max(0, duePlan.borrowed - planAtExtendedDate.borrowed),
    lateFeeIfMissed: lateFeeIfMissed(invoice, extraDays),
  };

  return {
    id,
    units: invoice.units,
    orderValue: invoice.amount,
    invoice,
    gap,
    earlyGap,
    options,
    earlyOptions,
    duePlan,
    earlyPlan,
    discount,
    recommended,
    loan: recommended.plan.borrowed,
    askFirst,
  };
}

export function runEngine(input: EngineInput): EngineResult {
  const planScenario = input.planScenario ?? "expected";
  const stock = rightSize(input.invoice, input.merchant, planScenario, input.salesDropPercent ?? 0);

  const keepFull = computeView("keep_full", input.invoice, input, planScenario);
  const rightSized = computeView(
    "right_sized",
    withUnits(input.invoice, stock.recommendedUnits),
    input,
    planScenario,
  );

  const recommendedView: ViewId = stock.recommend ? "right_sized" : "keep_full";
  return {
    stock,
    views: { keepFull, rightSized },
    recommendedView,
    recommended: recommendedView === "right_sized" ? rightSized : keepFull,
  };
}

export interface WhatIfRow {
  salesDropPercent: number;
  unsoldShare: number;
  recommendedView: ViewId;
  keepFull: { units: number; orderValue: number; gapExpected: number; loan: number; planCost: number };
  rightSized: { units: number; orderValue: number; gapExpected: number; loan: number; planCost: number };
}

/** Rerun the engine for each sales drop, giving both views side by side. */
export function runWhatIf(input: EngineInput, drops: number[] = [0, 10, 20, 30]): WhatIfRow[] {
  return drops.map((salesDropPercent) => {
    const r = runEngine({ ...input, salesDropPercent });
    const summary = (v: ViewResult) => ({
      units: v.units,
      orderValue: v.orderValue,
      gapExpected: v.gap.gapExpected,
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
