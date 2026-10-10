// One call that runs the whole engine. Change any input (e.g. salesDropPercent) and everything reruns.

import { CONFIG, type Scenario } from "./config";
import { computeGap, type GapResult } from "./gap";
import {
  buildFundingOptions,
  buildPlan,
  evaluateDiscount,
  type DiscountAnalysis,
  type FundingOption,
  type OptionId,
  type Plan,
} from "./options";
import type { Merchant } from "../data/merchant";
import type { Invoice } from "../data/invoice";

export interface EngineInput {
  merchant: Merchant;
  invoice: Invoice;
  /** What-if: forecast sales are this % lower. 0 = no change. */
  salesDropPercent?: number;
  /** Which sales scenario the plan is built for. Default: expected. */
  planScenario?: Scenario;
  overdraftRatePct?: number;
  supplierAgrees?: boolean;
  /** Options the founder doesn't want in the plan. */
  exclude?: OptionId[];
}

export type Timing = "on_due_date" | "pay_early_for_discount";

export interface EngineResult {
  gap: GapResult; // measured on the due date
  earlyGap: GapResult; // measured on the last day of the discount window
  options: FundingOption[]; // for paying on the due date
  earlyOptions: FundingOption[]; // for paying early
  duePlan: Plan;
  earlyPlan: Plan;
  discount: DiscountAnalysis;
  recommended: { timing: Timing; plan: Plan };
}

export function runEngine(input: EngineInput): EngineResult {
  const { merchant, invoice } = input;
  const salesDropPercent = input.salesDropPercent ?? 0;
  const planScenario = input.planScenario ?? "expected";
  const earlyDay = Math.min(invoice.earlyPayWithinDays, invoice.dueInDays);
  const daysEarly = invoice.dueInDays - earlyDay;

  const gap = computeGap({ merchant, invoice, salesDropPercent });
  const earlyGap = computeGap({ merchant, invoice, salesDropPercent, byDay: earlyDay });

  const common = {
    merchant,
    invoice,
    overdraftRatePct: input.overdraftRatePct,
    supplierAgrees: input.supplierAgrees,
  };
  const options = buildFundingOptions({ ...common, scenario: gap.scenarios[planScenario] });
  const earlyOptions = buildFundingOptions({
    ...common,
    scenario: earlyGap.scenarios[planScenario],
    forEarlyPayment: true,
    borrowDays: CONFIG.borrowDays + daysEarly, // money is needed that much sooner
  });

  const duePlan = buildPlan(gap.scenarios[planScenario].gap, options, input.exclude);
  const earlyPlan = buildPlan(earlyGap.scenarios[planScenario].gap, earlyOptions, input.exclude);
  const discount = evaluateDiscount(invoice, duePlan, earlyPlan);

  return {
    gap,
    earlyGap,
    options,
    earlyOptions,
    duePlan,
    earlyPlan,
    discount,
    recommended: discount.worthIt
      ? { timing: "pay_early_for_discount", plan: earlyPlan }
      : { timing: "on_due_date", plan: duePlan },
  };
}
