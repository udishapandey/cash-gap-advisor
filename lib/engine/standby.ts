// Standby: the extra cash that could be needed if sales come in low, and whether unused credit-line headroom covers it.
// The plan itself is sized to EXPECTED sales (no upfront buffer, so the founder never borrows for a case that may not
// happen). Standby is an undrawn safety margin: it costs nothing unless the founder chooses to draw it.
// Plain TypeScript, no AI. All amounts in ₹.

import type { ViewResult } from "./index";

export interface Standby {
  /** The most cash that could be needed beyond the plan, at the low end of the sales forecast. 0 means the plan already covers it. */
  amount: number;
  /** About which day (counting from today) that extra need peaks. */
  day: number;
  /** The worst-case peak need, and what the plan covers of it. */
  lowSalesPeakNeed: number;
  planCovers: number;
  /** The credit line's limit, what the plan draws from it, and what is left undrawn. */
  creditLimit: number;
  creditDrawn: number;
  headroom: number;
  /** True if unused credit-line headroom covers the standby amount. */
  coveredByHeadroom: boolean;
  /** How much of the standby the headroom cannot cover. */
  shortBy: number;
  /** What it would cost if the standby were drawn in full on the credit line (zero if it is never drawn). */
  costIfDrawn: number;
}

export function standbyFor(view: ViewResult): Standby {
  const plan = view.recommended.plan;
  const early = view.recommended.timing === "pay_early_for_discount";
  // The window the plan was sized on: the early payment day, or the due date.
  const low = (early ? view.earlyGap : view.gap).scenarios.low;
  const options = early ? view.earlyOptions : view.options;
  const credit = options.find((o) => o.id === "credit_line");

  const amount = Math.max(0, low.gap - plan.covered);
  const creditLimit = credit?.maxAmount ?? 0;
  const creditDrawn = plan.steps.find((s) => s.optionId === "credit_line")?.amount ?? 0;
  const headroom = Math.max(0, creditLimit - creditDrawn);
  const covered = Math.min(amount, headroom);
  return {
    amount,
    day: low.peak.day,
    lowSalesPeakNeed: low.gap,
    planCovers: plan.covered,
    creditLimit,
    creditDrawn,
    headroom,
    coveredByHeadroom: amount <= headroom,
    shortBy: amount - covered,
    costIfDrawn: credit ? Math.round(covered * credit.costRate) : 0,
  };
}
