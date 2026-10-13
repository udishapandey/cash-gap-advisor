import { describe, expect, it } from "vitest";
import { defaultInvoice } from "../data/default-scenario";
import { merchant } from "../data/merchant";
import { runEngine } from "./index";

// THE SIZING RULE: a plan is sized to the balance on EVERY day, never to one day's snapshot. For every slider value
// and every cash-elsewhere amount, a plan that says it is covered never lets the balance fall below the safety buffer
// on any day, and no loan is repaid before the cash exists.
const drops = [0, 10, 20, 30];
const cashes = [0, 50_000, 150_000, 400_000];

describe.each(drops)("sales down %i%", (drop) => {
  it.each(cashes)("with ₹%i of other cash, a covered plan never goes below the buffer on any day", (cash) => {
    const r = runEngine({ merchant, invoice: defaultInvoice, salesDropPercent: drop, cashElsewhere: cash });
    for (const v of [r.views.keepFull, r.views.rightSized]) {
      const plan = v.recommended.plan;
      if (!plan.fullyCovered) continue;
      expect(Math.min(...plan.sim.balanceByDay)).toBeGreaterThanOrEqual(plan.buffer - 1);
      // debt never exceeds the limits
      expect(plan.sim.stats.bank_overdraft.peak).toBeLessThanOrEqual(v.terms.overdraft.limit + 1);
      expect(plan.sim.stats.credit_line.peak).toBeLessThanOrEqual(v.terms.creditLine.limit + 1);
    }
  });

  it("the gap is the lowest the balance gets, measured over the whole window", () => {
    const v = runEngine({ merchant, invoice: defaultInvoice, salesDropPercent: drop }).recommended;
    const e = v.focusGap.scenarios.expected;
    expect(e.gap).toBe(Math.max(0, Math.round(50_000 - Math.min(...e.balanceByDay))));
  });

  it("an uncovered plan reports exactly what is left over, and borrowing never exceeds the limits", () => {
    const plan = runEngine({ merchant, invoice: defaultInvoice, salesDropPercent: drop }).recommended.recommended.plan;
    expect(plan.fullyCovered).toBe(plan.uncovered === 0);
    expect(plan.borrowed).toBeLessThanOrEqual(400_000 + 1);
  });
});

describe("the cost of a plan is never negative", () => {
  it.each(drops)("at %i%", (drop) => {
    const plan = runEngine({ merchant, invoice: defaultInvoice, salesDropPercent: drop }).recommended.recommended.plan;
    expect(plan.totalCost).toBeGreaterThanOrEqual(0);
    for (const s of plan.steps) expect(s.cost).toBeGreaterThanOrEqual(0);
  });
});
