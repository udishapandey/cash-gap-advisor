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

/** What the headline saving is measured against. The same basis is used on every screen that shows a saving. */
export const SAVING_BASIS = "Compared with the usual way: Razorpay credit line, then your bank's overdraft, paid on the due date.";

/** The "You saved" card: label, number and a short caption. A cost is never shown as a negative number. */
export function savedCard(o: OutcomeResult): { label: string; value: string; caption: string; tone: "saved" | "extra" | "even" } {
  const total = o.cost.moneySaved;
  const c = o.cost.fromCheaperFunding;
  const parts: string[] = [];
  if (o.cost.plan.discountCaptured > 0) parts.push(`${formatINR(o.cost.plan.discountCaptured)} discount`);
  parts.push(c >= 0 ? `${formatINR(c)} lower interest` : `${formatINR(-c)} higher interest`);
  const caption = parts.join(" + ");
  if (total > 0) return { label: "You saved", value: formatINR(total), caption, tone: "saved" };
  if (total === 0) return { label: "You saved", value: formatINR(0), caption, tone: "even" };
  return { label: "You paid extra", value: formatINR(-total), caption, tone: "extra" };
}

/** The three small cards: Borrowed, Pairs sold, Forecast. */
export function resultTiles(o: OutcomeResult): { label: string; value: string; caption: string }[] {
  const b = o.borrowing;
  const p = o.sales.vsForecastPercent;
  const miss = Math.round(Math.abs(p));
  return [
    {
      label: "Borrowed",
      value: formatINR(b.borrowed),
      caption: b.underFunded > 0 ? `${formatINR(b.underFunded)} more needed` : b.unnecessary > 0 ? `${formatINR(b.unnecessary)} not needed` : "All of it needed",
    },
    { label: "Pairs sold", value: `${o.stock.sold} of ${o.stock.ordered}`, caption: o.stock.leftOver > 0 ? `${o.stock.leftOver} left over` : "" },
    {
      label: "Forecast",
      value: miss === 0 ? "On target" : `${miss}% ${p < 0 ? "below" : "above"}`,
      caption: o.sales.insideRange ? "" : "Outside the range",
    },
  ];
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
