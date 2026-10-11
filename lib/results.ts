// The Results screen's words and wiring. Plain TypeScript, no AI: every number comes from computeOutcome().

import type { Merchant } from "./data/merchant";
import { merchant as simulatedMerchant } from "./data/merchant";
import type { EngineResult } from "./engine";
import { computeOutcome, SIMULATED_OUTCOMES, type OutcomeId, type OutcomeResult } from "./engine/outcome";
import { formatINR, formatSignedINR } from "./format";
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

/**
 * The headline, split into its two parts: money saved by cheaper funding, and the early-payment discount the plan
 * captured (the default never takes it). The two parts add up to the total exactly.
 */
export function heroLine(o: OutcomeResult): string {
  const total = o.cost.moneySaved;
  const parts = [`${formatSignedINR(o.cost.fromCheaperFunding)} from cheaper funding`];
  if (o.cost.plan.discountCaptured > 0) parts.push(`${formatINR(o.cost.plan.discountCaptured)} early-payment discount captured`);
  if (total > 0) return `${formatINR(total)} better off: ${parts.join(" + ")}`;
  if (total === 0) return "No better or worse off than drawing the full amount on your credit line";
  return `${formatINR(-total)} worse off: ${parts.join(" + ")}`;
}

/** The sentence for a default that cannot cover the whole gap: what the founder could not have funded. */
export function defaultCannotFund(o: OutcomeResult): string {
  return `Without a plan, the founder couldn't fund ${formatINR(o.cost.default.uncovered)} — they would have to pay late or cut the order.`;
}

/** What the hero number is measured against, in words. */
export function heroBasis(o: OutcomeResult): string {
  return o.cost.default.coversWholeGap
    ? "Compared with the default: credit line up to its limit, then your bank overdraft for the rest, paid on the due date with no discount."
    : `Compared with the default: credit line up to its limit, then your bank overdraft. ${defaultCannotFund(o)} The default's cost covers only what it could draw, so your saving is, if anything, bigger.`;
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
