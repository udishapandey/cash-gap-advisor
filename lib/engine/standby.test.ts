import { describe, expect, it } from "vitest";
import { merchant } from "../data/merchant";
import { sampleInvoice } from "../data/invoice";
import { runEngine } from "./index";
import { standbyFor } from "./standby";

const run = (drop = 0, cashElsewhere = 0) => runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: drop, cashElsewhere });
const DROPS = [0, 5, 10, 15, 20, 25, 30];

describe("standby: the extra cash that could be needed at low sales", () => {
  it("is the low-sales peak need minus what the plan already covers", () => {
    const view = run(0).views.keepFull;
    const sb = standbyFor(view);
    expect(view.recommended.timing).toBe("pay_early_for_discount");
    expect(sb.lowSalesPeakNeed).toBe(view.earlyGap.scenarios.low.gap); // the window the pay-early plan was sized on
    expect(sb.planCovers).toBe(view.recommended.plan.covered);
    expect(sb.amount).toBe(sb.lowSalesPeakNeed - sb.planCovers);
    expect(sb.amount).toBeGreaterThan(0);
  });

  it("says roughly which day the extra need peaks on", () => {
    const view = run(0).views.keepFull;
    const sb = standbyFor(view);
    expect(sb.day).toBe(view.earlyGap.scenarios.low.peak.day);
    expect(sb.day).toBeGreaterThan(0);
    expect(sb.day).toBeLessThanOrEqual(sampleInvoice.dueInDays);
  });

  it("is covered by the credit line's unused headroom: its limit minus what the plan draws", () => {
    const view = run(0).views.keepFull;
    const sb = standbyFor(view);
    const drawn = view.recommended.plan.steps.find((s) => s.optionId === "credit_line")?.amount ?? 0;
    expect(sb.creditLimit).toBe(merchant.creditLineLimit);
    expect(sb.creditDrawn).toBe(drawn);
    expect(sb.headroom).toBe(merchant.creditLineLimit - drawn);
    expect(sb.coveredByHeadroom).toBe(sb.amount <= sb.headroom);
    expect(sb.coveredByHeadroom).toBe(true);
    expect(sb.shortBy).toBe(0);
  });

  it("costs nothing unless drawn, and says what it would cost if drawn in full", () => {
    const view = run(0).views.keepFull;
    const sb = standbyFor(view);
    const credit = view.earlyOptions.find((o) => o.id === "credit_line")!;
    expect(sb.costIfDrawn).toBe(Math.round(sb.amount * credit.costRate));
    expect(sb.costIfDrawn).toBeGreaterThan(0);
    // Nothing in the plan itself draws it: the plan's cost does not include the standby.
    expect(view.recommended.plan.totalCost).toBe(view.recommended.plan.steps.reduce((t, s) => t + s.cost, 0));
    expect(view.recommended.plan.covered).toBe(sb.planCovers);
  });

  it("warns (is not covered) when unused headroom cannot cover it, and says by how much", () => {
    const sb = standbyFor(run(30).views.keepFull);
    expect(sb.amount).toBeGreaterThan(sb.headroom);
    expect(sb.coveredByHeadroom).toBe(false);
    expect(sb.shortBy).toBe(sb.amount - sb.headroom);
    expect(sb.costIfDrawn).toBeGreaterThan(0);
  });

  it("is zero when the plan already covers even the low-sales case", () => {
    const sb = standbyFor(run(0, 5_000_000).views.keepFull);
    expect(sb.amount).toBe(0);
    expect(sb.coveredByHeadroom).toBe(true);
    expect(sb.shortBy).toBe(0);
    expect(sb.costIfDrawn).toBe(0);
  });

  it("is never negative, and shortBy is zero exactly when headroom covers it, at every slider value", () => {
    for (const cash of [0, 100_000]) {
      for (const drop of DROPS) {
        const r = run(drop, cash);
        for (const view of [r.views.keepFull, r.views.rightSized]) {
          const sb = standbyFor(view);
          const label = `${view.id} -${drop}% cash ${cash}`;
          expect(sb.amount, label).toBeGreaterThanOrEqual(0);
          expect(sb.headroom, label).toBeGreaterThanOrEqual(0);
          expect(sb.headroom, label).toBeLessThanOrEqual(sb.creditLimit);
          expect(sb.shortBy === 0, label).toBe(sb.coveredByHeadroom);
          // The plan is sized to EXPECTED sales: it covers the expected peak, never the low-sales one.
          expect(sb.planCovers, label).toBeGreaterThanOrEqual(view.recommended.plan.gap - 1);
        }
      }
    }
  });

  it("does not change the plan: the plan is still sized to expected sales, with no upfront buffer", () => {
    const view = run(0).views.keepFull;
    expect(view.recommended.plan.gap).toBe(view.earlyGap.scenarios.expected.gap);
    expect(view.recommended.plan.gap).toBeLessThan(standbyFor(view).lowSalesPeakNeed);
  });
});
