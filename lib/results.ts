// The Results screen's words and wiring. Plain TypeScript, no AI: every number comes from computeOutcome().

import type { Merchant } from "./data/merchant";
import { merchant as simulatedMerchant } from "./data/merchant";
import type { EngineResult } from "./engine";
import { computeOutcome, SIMULATED_OUTCOMES, type OutcomeId, type OutcomeResult } from "./engine/outcome";
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

const times = (n: number) => `${n}x`;

/** What the headline saving is measured against. The same basis is used on every screen that shows a saving. */
export const SAVING_BASIS = "Compared with the usual way: Razorpay credit line, then your bank's overdraft, paid on the due date.";

/** The headline, in one short sentence. */
export function heroHeadline(o: OutcomeResult): string {
  const total = o.cost.moneySaved;
  if (total > 0) return `You're ${formatINR(total)} better off than the usual way.`;
  if (total === 0) return "You're about even with the usual way.";
  return `You're ${formatINR(-total)} worse off than the usual way.`;
}

/**
 * The headline split into its two parts: less interest and fees, and the early-payment discount the plan captured (the
 * usual way never takes it). The two parts add up to the total exactly. A cost is never shown as a negative number.
 */
export function heroParts(o: OutcomeResult): string {
  const c = o.cost.fromCheaperFunding;
  const parts = [c >= 0 ? `${formatINR(c)} less in interest and fees` : `${formatINR(-c)} more in interest and fees`];
  if (o.cost.plan.discountCaptured > 0) parts.push(`${formatINR(o.cost.plan.discountCaptured)} early-payment discount`);
  return parts.join(" + ");
}

/** The second line of the plan's cost story: the discount more than covers the interest, or what is left to pay. */
export function planCostLine(o: OutcomeResult): string {
  const { fundsCost, discountCaptured } = o.cost.plan;
  if (discountCaptured > fundsCost) return `The discount more than covers the interest by ${formatINR(discountCaptured - fundsCost)}.`;
  return `Total interest and fees: ${formatINR(fundsCost - discountCaptured)} after the discount.`;
}

/** What the headline is compared with, in words. */
export function heroBasis(o: OutcomeResult): string {
  return o.cost.default.coversWholeGap ? SAVING_BASIS : `${SAVING_BASIS} ${defaultCannotFund(o)}`;
}

/** The "Forecast accuracy" tile: how sales came in against the forecast, and whether that is inside the forecast range. */
export function accuracyTile(o: OutcomeResult): { value: string; note: string } {
  const p = o.sales.vsForecastPercent;
  const miss = Math.round(Math.abs(p));
  return {
    value: miss === 0 ? "Sales as forecast" : `${miss}% ${p < 0 ? "below" : "above"} forecast`,
    note: o.sales.insideRange ? "Inside the forecast range" : "Outside the forecast range",
  };
}

/** The "Borrowed more than needed" tile's note: what to know when the plan was short. */
export function borrowingNote(o: OutcomeResult): string {
  const b = o.borrowing;
  if (b.underFunded > 0) {
    return b.beyondStandby > 0
      ? `Needed ${formatINR(b.underFunded)} more: ${formatINR(b.drawnFromStandby)} from your backup, ${formatINR(b.beyondStandby)} beyond it.`
      : `Needed ${formatINR(b.underFunded)} more, which your backup would cover.`;
  }
  return b.unnecessary > 0 ? "More than the cash you really needed." : "Every rupee borrowed was needed.";
}

/** Pairs that sold out: neutral when sales were as forecast, a heads-up when they beat it. */
export function soldOutNote(o: OutcomeResult): { text: string; neutral: boolean } | null {
  if (o.stock.missedPairs <= 0) return null;
  const neutral = Math.round(o.sales.vsForecastPercent) === 0;
  return {
    neutral,
    text: neutral
      ? `All ${o.stock.sold} sold; demand was about ${o.stock.missedPairs} pairs higher.`
      : `All ${o.stock.sold} sold out: customers wanted about ${o.stock.missedPairs} more pairs.`,
  };
}

/** The sentence for a default that cannot cover the whole gap: what the founder could not have funded. */
export function defaultCannotFund(o: OutcomeResult): string {
  return `Without a plan, the founder couldn't fund ${formatINR(o.cost.default.uncovered)} — they would have to pay late or cut the order.`;
}

/** "What I learned": plain sentences about the sales forecast and the COD return rate. */
export function learnedLines(o: OutcomeResult, salesDropPercent: number): string[] {
  const { uplift, codReturnRate: cod } = o.learned;
  const lines: string[] = [];

  const miss = Math.round(Math.abs(uplift.vsEstimatePercent));
  if (miss === 0) {
    lines.push(`Festive sales came in as forecast, so I'll keep starting from ${times(uplift.before)}.`);
  } else {
    // With a what-if applied, the forecast was the founder's own lower case, so say what it is measured against.
    const against = salesDropPercent > 0 ? `my usual ${times(uplift.before)} estimate` : "forecast";
    lines.push(
      `Festive sales came in ${miss}% ${uplift.vsEstimatePercent < 0 ? "below" : "above"} ${against}. Next time I'll start from ${times(uplift.after)} instead of ${times(uplift.before)}.`,
    );
  }

  if (cod.observedPercent === cod.assumedPercent) {
    lines.push(`COD returns came in at ${cod.assumedPercent}%, the same as I assumed.`);
  } else {
    lines.push(
      `COD returns were ${cod.observedPercent}% against the ${cod.assumedPercent}% I assumed. Next time I'll assume ${cod.updatedPercent}%.`,
    );
  }
  return lines;
}
