// The Results screen's words and wiring. Plain TypeScript, no AI: every number comes from computeOutcome().

import type { Merchant } from "./data/merchant";
import { merchant as simulatedMerchant } from "./data/merchant";
import type { EngineResult } from "./engine";
import { computeOutcome, midSeasonCheck, SIMULATED_OUTCOMES, type MidSeason, type MidSeasonChange, type OutcomeId, type OutcomeResult } from "./engine/outcome";
import { formatINR } from "./format";
import type { JourneyState } from "./journey";

/** The outcome of the approved plan under one simulated result. Null until a plan is chosen. */
export function outcomeForState(
  result: EngineResult,
  state: Pick<JourneyState, "chosenView" | "salesDropPercent" | "cashElsewhere">,
  id: OutcomeId,
  merchant: Merchant = simulatedMerchant,
): OutcomeResult | null {
  if (state.chosenView === null) return null;
  return computeOutcome({
    approved: state.chosenView === "right_sized" ? result.views.rightSized : result.views.keepFull,
    fullOrder: result.views.keepFull,
    stock: result.stock,
    merchant,
    salesDropPercent: state.salesDropPercent,
    cashElsewhere: state.cashElsewhere,
    actual: SIMULATED_OUTCOMES[id],
  });
}

/** The mid-season check for the approved plan: day 15, sales 15% below the forecast. Null until a plan is chosen. */
export function midSeasonForState(
  result: EngineResult,
  state: Pick<JourneyState, "chosenView" | "salesDropPercent" | "cashElsewhere">,
  merchant: Merchant = simulatedMerchant,
): MidSeason | null {
  if (state.chosenView === null) return null;
  return midSeasonCheck({
    approved: state.chosenView === "right_sized" ? result.views.rightSized : result.views.keepFull,
    fullOrder: result.views.keepFull,
    stock: result.stock,
    merchant,
    salesDropPercent: state.salesDropPercent,
    cashElsewhere: state.cashElsewhere,
    actual: SIMULATED_OUTCOMES.lower_15,
  });
}

/** What the headline saving is measured against. The same basis is used on every screen that shows a saving. */
export const SAVING_BASIS = "Compared with paying on the due date, with no discount and any shortfall on the credit line.";

/** The headline: what the plan saved against the usual way. A cost is never shown as a negative number. */
export function savedHeadline(o: OutcomeResult): string {
  const total = o.cost.moneySaved;
  if (total > 0) return `This plan saved you ${formatINR(total)}`;
  if (total === 0) return "This plan cost the same as the usual way";
  return `This plan cost you ${formatINR(-total)} more`;
}

/** The three figures behind the headline: the discount, the plan's interest and fees, and the usual way's. */
export function savedBreakdown(o: OutcomeResult): { label: string; value: string }[] {
  return [
    { label: "Discount", value: formatINR(o.cost.plan.discountCaptured) },
    { label: "Interest and fees", value: formatINR(o.cost.plan.fundsCost) },
    { label: "Paying on the due date", value: formatINR(o.cost.default.fundsCost) },
  ];
}

/** The small table: the cash to find, forecast against actual. The difference is in words, never a minus sign. */
export function gapRow(o: OutcomeResult): { forecast: string; actual: string; difference: string } {
  const d = o.gap.difference;
  return {
    forecast: formatINR(o.gap.forecast),
    actual: formatINR(o.gap.actual),
    difference: d === 0 ? "None" : d > 0 ? `${formatINR(d)} more` : `${formatINR(-d)} less`,
  };
}

/** The two "Next time" bullets, each at most ten words. */
export function nextTimeBullets(o: OutcomeResult, salesDropPercent: number): string[] {
  const { uplift, codReturnRate: cod } = o.learned;
  const miss = Math.round(Math.abs(uplift.vsEstimatePercent));
  const against = salesDropPercent > 0 ? "normal" : "forecast";
  const sales =
    miss === 0
      ? `Sales matched forecast. Keep starting at ${uplift.before}x.`
      : `Sales ran ${miss}% ${uplift.vsEstimatePercent < 0 ? "under" : "over"} ${against}. Next time, start at ${uplift.after}x.`;
  const returns =
    cod.observedPercent === cod.assumedPercent
      ? `COD returns matched the ${cod.assumedPercent}% assumed.`
      : `COD returns were ${cod.observedPercent}%, not ${cod.assumedPercent}%. Next time, expect ${cod.updatedPercent}%.`;
  return [sales, returns];
}

// ---------- the mid-season check ----------

export const NEXT_TIME_CAPTION = "Prototype uses a simple update rule. Production would learn from your history.";
export const MID_SEASON_CAPTION = "The plan updates as real sales arrive. Sales are simulated in this prototype.";

/** Each change the re-plan makes, in a short line. `date` turns a day count into a date. */
export function changeLine(c: MidSeasonChange, date: (day: number) => string): string {
  switch (c.kind) {
    case "withdraw_credit":
      return `Withdraw ${formatINR(c.amount ?? 0)} more credit${c.day !== undefined ? ` on ${date(c.day)}` : ""}`;
    case "draw_overdraft":
      return `Draw ${formatINR(c.amount ?? 0)} more overdraft`;
    case "backup_used":
      return `Backup used: ${formatINR(c.amount ?? 0)} of your unused credit`;
    case "repay_later":
      return `Repayment moves from ${date(c.from ?? 0)} to ${date(c.to ?? 0)}`;
    case "repay_earlier":
      return `Repayment moves from ${date(c.from ?? 0)} to ${date(c.to ?? 0)}`;
    case "pay_on_due_date":
      return `Pay on ${date(c.to ?? 0)} instead of ${date(c.from ?? 0)}`;
    case "uncovered":
      return `${formatINR(c.amount ?? 0)} is still not covered`;
  }
}

/** The mid-season check as the screen shows it. */
export function midSeasonView(m: MidSeason, date: (day: number) => string) {
  const miss = Math.round(Math.abs(m.vsForecastPercent));
  const earlyDate = date(m.early.payDay);
  const dueDate = date(m.due.payDay);
  return {
    headline:
      miss === 0
        ? `Day ${m.day} check: sales are on forecast.`
        : `Day ${m.day} check: sales are ${miss}% ${m.vsForecastPercent < 0 ? "below" : "above"} forecast.`,
    rows: [
      { label: "Cash in so far, forecast", value: formatINR(m.cashInForecast) },
      { label: "Cash in so far, actual", value: formatINR(m.cashInActual) },
      { label: `Likely gap for ${earlyDate}, forecast`, value: formatINR(m.forecastGap) },
      { label: `Likely gap for ${earlyDate}, updated`, value: formatINR(m.updatedGap) },
    ],
    /** The updated plan for paying early, and for paying on the due date. */
    plans: [
      { label: `Pay on ${earlyDate}`, cost: formatINR(m.early.cost), saving: formatINR(Math.max(0, m.early.saving)) },
      { label: `Pay on ${dueDate}`, cost: formatINR(m.due.cost), saving: formatINR(Math.max(0, m.due.saving)) },
    ],
    verdict: m.stillWorthIt
      ? `Paying early on ${earlyDate} is still worth it.`
      : `Paying early is no longer worth it. Pay on ${dueDate} instead.`,
    verdictWhy: m.stillWorthIt ? null : m.early.feasible ? "Slow sales would leave you short." : "The credit limits no longer cover it.",
    changes: m.changes.map((c) => changeLine(c, date)),
    nothingChanges: m.nothingChanges ? "Nothing changes." : null,
  };
}
