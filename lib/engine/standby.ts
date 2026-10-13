// Backup: what is left of the credit line, and whether it covers slow sales. Plain TypeScript, no AI. All amounts in ₹.
//
// The plan is built for EXPECTED sales, with no upfront buffer of borrowing. The backup is the unused credit line:
// it costs nothing unless it is used. The slow-sales case is the same plan (same sources, same order) run on the low
// forecast: it is covered if no shortfall is left.

import type { ViewResult } from "./index";

export interface Standby {
  creditLimit: number;
  /** The most of the credit line the plan uses. */
  creditDrawn: number;
  /** What is left: the backup. */
  unusedCredit: number;
  /** The most owed (overdraft and credit line) if sales are slow, and how much more than the plan expects. */
  lowSalesPeakBorrowed: number;
  extraNeeded: number;
  /** True if slow sales still leave the safety buffer covered. */
  lowSalesCovered: boolean;
  /** The shortfall left if not. */
  shortBy: number;
}

export function standbyFor(view: ViewResult): Standby {
  const plan = view.recommended.plan;
  const creditLimit = view.terms.creditLine.limit;
  const creditDrawn = Math.round(plan.sim.stats.credit_line.peak);
  return {
    creditLimit,
    creditDrawn,
    unusedCredit: Math.max(0, creditLimit - creditDrawn),
    lowSalesPeakBorrowed: plan.simLow.peakBorrowed,
    extraNeeded: Math.max(0, plan.simLow.peakBorrowed - plan.sim.peakBorrowed),
    lowSalesCovered: plan.simLow.feasible,
    // Never more than the whole slow-sales gap: later days can run short only because sales stay slow for ever.
    shortBy: Math.min(plan.simLow.uncoveredPeak, view.focusGap.gapMax),
  };
}
