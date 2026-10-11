// "Why this plan": a plain-text template that shows the engine's own arithmetic. No AI.
// (Phase 4 will let an AI explain trade-offs in friendlier words. The numbers always come from here.)

import type { ViewResult } from "./engine";
import { CONFIG } from "./engine/config";
import { expectedLostMargin, type RightSizing } from "./engine/stock";
import { formatINR, formatPct } from "./format";
import { earlyPayDay } from "./journey";

/** One line per fact, in the order a person would check them. */
export function explainPlan(
  view: ViewResult,
  stock: RightSizing,
  opts: { salesDropPercent?: number } = {},
): string[] {
  const lines: string[] = [];
  const plan = view.recommended.plan;
  const early = view.recommended.timing === "pay_early_for_discount";
  const gap = early ? view.earlyGap : view.gap;
  const options = early ? view.earlyOptions : view.options;
  const s = gap.scenarios.expected;
  const drop = opts.salesDropPercent ?? 0;

  lines.push(
    `Based on expected sales (${s.uplift}x the recent daily baseline)${
      drop > 0 ? `, then ${drop}% lower` : ""
    }. All sales, COD and balance figures are simulated.`,
  );

  // 1. What has to be paid, and what will be there.
  lines.push(
    `Cash needed by day ${gap.byDay}: invoice ${formatINR(s.invoiceDue)} + other outflows ${formatINR(s.otherOutflows)} = ${formatINR(s.cashOut)}.`,
  );
  const parts = [
    `bank balance ${formatINR(s.cash.bankBalance)}`,
    `sales in transit ${formatINR(s.cash.settlementsInTransit)}`,
    `forecast prepaid sales ${formatINR(s.cash.forecastPrepaid)}`,
    `COD after returns ${formatINR(s.cash.codPayouts)}`,
  ];
  if (s.cash.cashElsewhere > 0) parts.push(`cash elsewhere ${formatINR(s.cash.cashElsewhere)}`);
  lines.push(`Cash expected by then: ${formatINR(s.cash.totalIn)} = ${parts.join(" + ")}.`);
  lines.push(
    s.gap > 0
      ? `Expected gap: ${formatINR(s.cashOut)} − ${formatINR(s.cash.totalIn)} = ${formatINR(s.gap)}.`
      : `No gap: expected cash is ${formatINR(s.surplus)} more than is needed.`,
  );

  // 2. How the gap is covered, cheapest first.
  if (plan.steps.length > 0) {
    lines.push("Sources are used cheapest first, by what each rupee really costs:");
    for (const step of plan.steps) {
      const option = options.find((o) => o.id === step.optionId);
      const rate = option ? formatPct(option.costRate * 100) : formatPct((step.cost / step.amount) * 100);
      lines.push(
        `  • ${step.name}: ${formatINR(step.amount)} × ${rate} = ${formatINR(step.cost)}${step.isBorrowing ? " (a loan)" : ""}.`,
      );
    }
    const usedIds = new Set(plan.steps.map((st) => st.optionId));
    for (const option of options) {
      if (usedIds.has(option.id)) continue;
      const why =
        view.id === "keep_full" && option.id === "split_order"
          ? "left out because you keep the full order"
          : plan.fullyCovered
            ? "not needed, cheaper sources covered the gap"
            : "not available";
      lines.push(`  • Not used: ${option.name} (${formatPct(option.costRate * 100)} per rupee): ${why}.`);
    }
    lines.push(
      `Total cost ${formatINR(plan.totalCost)}. Loans (credit line and overdraft) total ${formatINR(plan.borrowed)}.`,
    );
  }
  if (!plan.fullyCovered) {
    lines.push(
      `Warning: the confirmed sources cover only ${formatINR(plan.covered)} of the gap. ${formatINR(plan.uncovered)} is not covered.`,
    );
  }

  // 3. The size of the order.
  const unitsCut = stock.fullUnits - view.units;
  if (view.id === "right_sized" && unitsCut > 0) {
    const demand = stock.demandByScenario[stock.basis];
    const lost = expectedLostMargin({
      orderUnits: stock.fullUnits,
      unitsNotOrdered: unitsCut,
      demandUnits: demand,
    }).expectedLostMargin;
    lines.push(
      `Order right-sized: the forecast says about ${Math.floor(demand)} of ${stock.fullUnits} pairs will sell, so ${unitsCut} pairs (${Math.round(stock.unsoldShare * 100)}%) would stay unsold. Ordering ${view.units} saves ${formatINR(stock.cashSaved)}, with an expected lost margin of ${formatINR(lost)}.`,
    );
  } else if (view.id === "keep_full" && stock.unitsCut > 0) {
    lines.push(
      `If you keep the full order, about ${stock.unitsCut} of ${stock.fullUnits} pairs (${Math.round(stock.unsoldShare * 100)}%) are expected to stay unsold.`,
    );
  }

  // 4. Paying early for the discount. Funding the earlier gap can cost more OR less, so say which.
  const d = view.discount;
  if (d.discountAmount > 0) {
    const funding = `${formatINR(Math.abs(d.extraFundingCost))} ${d.extraFundingCost >= 0 ? "more" : "less"}`;
    if (early) {
      lines.push(
        `Paying by day ${earlyPayDay(view.invoice)} earns the ${view.invoice.earlyPayDiscountPct}% discount of ${formatINR(d.discountAmount)}, and funding it costs ${funding}: a net saving of ${formatINR(d.netSaving)}.`,
      );
    } else {
      lines.push(
        d.affordable
          ? `Paying early would save ${formatINR(d.discountAmount)} but funding it costs ${funding}: a net ${formatINR(d.netSaving)}, so it is not worth it.`
          : `Paying early would save ${formatINR(d.discountAmount)}, but the confirmed sources can't cover the larger early gap.`,
      );
    }
  }

  lines.push(
    `Borrowed money is assumed out for ${CONFIG.borrowDays} days${early ? ` plus ${view.invoice.dueInDays - earlyPayDay(view.invoice)} for paying early` : ""}.`,
  );
  return lines;
}
