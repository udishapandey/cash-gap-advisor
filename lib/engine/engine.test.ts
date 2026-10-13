import { describe, expect, it } from "vitest";
import { defaultInvoice } from "../data/default-scenario";
import { merchant } from "../data/merchant";
import { CONFIG } from "./config";
import { runEngine, runWhatIf } from "./index";
import { standbyFor } from "./standby";

const demo = () => runEngine({ merchant, invoice: defaultInvoice });

describe("the demo plan (₹5L bill, 2/10 net 30)", () => {
  const view = demo().recommended;
  const plan = view.recommended.plan;
  const step = (id: string) => plan.steps.find((s) => s.optionId === id);

  it("pays early on day 10 for the discount", () => {
    expect(view.recommended.timing).toBe("pay_early_for_discount");
    expect(plan.payDay).toBe(10);
    expect(plan.payAmount).toBe(490_000);
    expect(view.discount.discountAmount).toBe(10_000);
    expect(view.discount.worthIt).toBe(true);
  });

  it("finds a gap of about ₹2.3L, as a range", () => {
    expect(view.focusGap.gapExpected).toBe(230_900);
    expect(view.focusGap.gapMin).toBe(96_500);
    expect(view.focusGap.gapMax).toBe(365_300);
  });

  it("uses own cash first, then the overdraft, then the credit line; never instant settlement", () => {
    expect(step("own_cash")?.amount).toBe(259_100);
    expect(step("bank_overdraft")).toMatchObject({ amount: 100_000, days: 8, cost: 208, closedDay: 18 });
    expect(step("credit_line")).toMatchObject({ amount: 130_900, days: 5, cost: 209, closedDay: 15 });
    expect(step("early_settlement")).toBeUndefined();
  });

  it("costs the sum of its steps: ₹417", () => {
    expect(plan.totalCost).toBe(417);
    expect(plan.steps.reduce((t, s) => t + s.cost, 0)).toBe(417);
  });

  it("the plan covers the gap, and the borrowed amount is the overdraft plus the credit line", () => {
    expect(plan.fullyCovered).toBe(true);
    expect(view.loan).toBe(230_900);
    expect(plan.ownCash + plan.borrowed).toBe(plan.steps.reduce((t, s) => t + s.amount, 0));
  });

  it("keeps the unused credit as backup, and the low-sales case stays covered", () => {
    const sb = standbyFor(view);
    expect(sb.unusedCredit).toBe(169_100);
    expect(sb.lowSalesCovered).toBe(true);
  });

  it("compares against paying on the due date with no discount: that default costs nothing here", () => {
    expect(view.defaultPlan.totalCost).toBe(0);
    expect(view.discount.netSaving).toBe(9_583);
  });
});

describe("pay early only if it is worth it and safe", () => {
  it("never pays early when the discount is smaller than the extra cost", () => {
    const stingy = runEngine({ merchant, invoice: { ...defaultInvoice, earlyPayDiscountPct: 0.01 } }).recommended;
    expect(stingy.recommended.timing).toBe("on_due_date");
  });
  it("pays on the due date when there is no discount at all", () => {
    const none = runEngine({ merchant, invoice: { ...defaultInvoice, earlyPayDiscountPct: 0 } }).recommended;
    expect(none.recommended.timing).toBe("on_due_date");
    expect(none.recommended.plan.payDay).toBe(defaultInvoice.dueInDays);
  });
  it("always recommends the whole order: ordering fewer pairs is not part of paying the supplier", () => {
    for (const d of [0, 10, 20, 30]) expect(runEngine({ merchant, invoice: defaultInvoice, salesDropPercent: d }).recommendedView).toBe("keep_full");
  });
});

describe("repayment is day by day, not a fixed term", () => {
  it("each loan is repaid on the day cash allows, and interest is only for the days used", () => {
    const plan = demo().recommended.recommended.plan;
    for (const s of plan.steps.filter((x) => x.isBorrowing)) {
      expect(s.closedDay).not.toBeNull();
      expect(s.days).toBeLessThan(30);
    }
  });
  it("interest is the rate x amount x days / 365 on the closing debt (overdraft 11%)", () => {
    const od = demo().recommended.recommended.plan.steps.find((s) => s.optionId === "bank_overdraft")!;
    expect(od.cost).toBeLessThanOrEqual(Math.round((od.amount * CONFIG.overdraftRatePct * (od.days ?? 0)) / 100 / 365) + 1);
    expect(od.cost).toBeGreaterThan(0);
  });
  it("the most expensive loan is repaid first: the credit line closes before the overdraft", () => {
    const steps = demo().recommended.recommended.plan.steps;
    const credit = steps.find((s) => s.optionId === "credit_line")!;
    const od = steps.find((s) => s.optionId === "bank_overdraft")!;
    expect(credit.closedDay!).toBeLessThan(od.closedDay!);
  });
});

describe("instant settlement", () => {
  it("is a flat fee: 0.30% plus 18% GST, once per settlement", () => {
    const fee = (CONFIG.earlySettlementFeePct * (100 + CONFIG.earlySettlementGstPct)) / 100;
    expect(fee).toBeCloseTo(0.354, 5);
  });
  it("is offered up to the earned-but-unsettled sales and the ₹2L daily limit", () => {
    const opt = demo().recommended.options.find((o) => o.id === "early_settlement")!;
    expect(opt.maxAmount).toBeLessThanOrEqual(CONFIG.earlySettlementDailyLimit);
    expect(opt.maxAmount).toBe(156_800);
  });
  it("is not forced into the plan when the overdraft is cheaper", () => {
    for (const d of [0, 10, 20])
      expect(runEngine({ merchant, invoice: defaultInvoice, salesDropPercent: d }).recommended.recommended.plan.steps.some((s) => s.optionId === "early_settlement")).toBe(false);
  });
});

describe("what-if slider", () => {
  const rows = runWhatIf({ merchant, invoice: defaultInvoice }, [0, 10, 20, 30]);
  it("returns one row per drop", () => {
    expect(rows.map((r) => r.salesDropPercent)).toEqual([0, 10, 20, 30]);
  });
  it("a bad enough drop leaves some of the bill uncovered, and the engine says so", () => {
    const bad = runEngine({ merchant, invoice: defaultInvoice, salesDropPercent: 30 }).recommended.recommended.plan;
    expect(bad.fullyCovered).toBe(false);
    expect(bad.uncovered).toBeGreaterThan(0);
  });
});

describe("the safety buffer", () => {
  it("is ₹50,000 and is kept on every day of the plan when the plan is covered", () => {
    expect(CONFIG.safetyBufferRupees).toBe(50_000);
    const plan = demo().recommended.recommended.plan;
    expect(plan.buffer).toBe(50_000);
    const lowest = Math.min(...plan.sim.balanceByDay);
    expect(lowest).toBeGreaterThanOrEqual(plan.buffer - 1);
  });
});
