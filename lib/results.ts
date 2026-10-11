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

/** The headline: what the plan saved against drawing the whole gap on the credit line. */
export function heroLine(o: OutcomeResult): string {
  const saved = o.cost.moneySaved;
  if (saved > 0) return `You saved ${formatINR(saved)} compared with drawing the full amount on your credit line.`;
  if (saved === 0) return "The plan cost the same as drawing the full amount on your credit line.";
  return `The plan cost ${formatINR(-saved)} more than drawing the full amount on your credit line.`;
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
