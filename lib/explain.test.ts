import { describe, expect, it } from "vitest";
import { merchant } from "./data/merchant";
import { sampleInvoice } from "./data/invoice";
import { runEngine, type EngineInput } from "./engine";
import { OPTION_LABEL } from "./plain";
import { explainPlanTemplate } from "./explain";
import { formatINR } from "./format";

const run = (extra: Partial<EngineInput> = {}, invoice = sampleInvoice) => runEngine({ merchant, invoice, ...extra });
const dueDateInvoice = { ...sampleInvoice, earlyPayDiscountPct: 0.01 };
const text = (lines: string[]) => lines.join("\n");

describe("Why this plan (plain-text template)", () => {
  it("shows the cash needed, the cash expected and the gap, with the engine's own numbers", () => {
    const r = run({}, dueDateInvoice);
    const view = r.views.keepFull;
    const s = view.gap.scenarios.expected;
    const out = text(explainPlanTemplate(view, r.stock));
    expect(out).toContain(`Cash needed by day 10: invoice ${formatINR(s.invoiceDue)} + other outflows ${formatINR(s.otherOutflows)} = ${formatINR(s.cashOut)}`);
    expect(out).toContain(`Cash expected by then: ${formatINR(s.cash.totalIn)}`);
    expect(out).toContain(`bank balance ${formatINR(s.cash.bankBalance)}`);
    expect(out).toContain(`Expected gap: ${formatINR(s.cashOut)} − ${formatINR(s.cash.totalIn)} = ${formatINR(s.gap)}`);
  });

  it("shows amount × rate = cost for every step, cheapest first, and the totals", () => {
    const r = run({}, dueDateInvoice);
    const view = r.views.keepFull;
    const lines = explainPlanTemplate(view, r.stock);
    for (const step of view.recommended.plan.steps) {
      expect(text(lines)).toContain(`${OPTION_LABEL[step.optionId]}: ${formatINR(step.amount)} × `);
      expect(text(lines)).toContain(`= ${formatINR(step.cost)}`);
    }
    expect(text(lines)).toContain(`Total interest and fees ${formatINR(view.recommended.plan.totalCost)}`);
    expect(text(lines)).toContain(`totals ${formatINR(view.recommended.plan.borrowed)}`);
    expect(text(lines)).toContain("cheapest first");
    expect(text(lines)).toContain("(a loan)");
  });

  it("says why an option was not used", () => {
    const r = run({}, dueDateInvoice);
    const out = text(explainPlanTemplate(r.views.keepFull, r.stock));
    expect(out).toContain("Not used: Split the order");
    expect(out).toContain("left out because you keep the full order");
    expect(out).toContain("Not used: Razorpay credit line");
    expect(out).toContain("cheaper sources covered the gap");
  });

  it("explains a right-sized order: pairs, share unsold, cash saved, lost margin", () => {
    const r = run({ salesDropPercent: 30 }, dueDateInvoice);
    const out = text(explainPlanTemplate(r.views.rightSized, r.stock, { salesDropPercent: 30 }));
    expect(out).toContain("Ordering fewer pairs");
    expect(out).toContain("364 of 500 pairs");
    expect(out).toContain("136 pairs (27%)");
    expect(out).toContain("saves ₹1,36,000");
    expect(out).toContain("expected lost profit of ₹0");
    expect(out).toContain("30% lower");
  });

  it("when keeping the full order, warns how much stock would stay unsold", () => {
    const r = run({ salesDropPercent: 30 }, dueDateInvoice);
    const out = text(explainPlanTemplate(r.views.keepFull, r.stock));
    expect(out).toContain("keep the full order");
    expect(out).toContain("136 of 500 pairs (27%)");
    expect(text(explainPlanTemplate(run({}, dueDateInvoice).views.keepFull, run({}, dueDateInvoice).stock))).not.toContain("expected to stay unsold");
  });

  it("explains paying early: discount, extra funding cost, net saving", () => {
    const r = run();
    const view = r.views.keepFull;
    expect(view.recommended.timing).toBe("pay_early_for_discount");
    const out = text(explainPlanTemplate(view, r.stock));
    expect(out).toContain("Paying by day 7 earns the 2% discount of ₹10,000");
    expect(out).toContain(`${formatINR(view.discount.netSaving)} better off than paying on the due date`);
    expect(out).toContain("Cash needed by day 7");
  });

  it("says 'costs ₹X less' when paying early is cheaper to fund, never a negative amount", () => {
    // A 10% discount at -10% sales: the smaller early invoice more than pays for the longer loan.
    const r = run({ salesDropPercent: 10 }, { ...sampleInvoice, earlyPayDiscountPct: 10 });
    const view = r.views.keepFull;
    expect(view.recommended.timing).toBe("pay_early_for_discount");
    expect(view.discount.extraFundingCost).toBeLessThan(0);
    const out = text(explainPlanTemplate(view, r.stock, { salesDropPercent: 10 }));
    expect(out).toContain(`funding it costs ${formatINR(-view.discount.extraFundingCost)} less`);
    expect(out).toContain(`${formatINR(view.discount.netSaving)} better off than paying on the due date`);
    expect(out).not.toContain("₹-");
  });

  it("says 'costs ₹X more' when paying early costs more to fund", () => {
    const r = run();
    const view = r.views.keepFull;
    expect(view.discount.extraFundingCost).toBeGreaterThan(0);
    expect(text(explainPlanTemplate(view, r.stock))).toContain(`funding it costs ${formatINR(view.discount.extraFundingCost)} more`);
  });

  it("says when paying early is not worth it", () => {
    const r = run({}, dueDateInvoice);
    expect(text(explainPlanTemplate(r.views.keepFull, r.stock))).toContain("worse off than paying on the due date: not worth it");
  });

  it("mentions cash available elsewhere only when there is some", () => {
    const none = run({}, dueDateInvoice);
    expect(text(explainPlanTemplate(none.views.keepFull, none.stock))).not.toContain("cash elsewhere");
    const some = run({ cashElsewhere: 75_000 }, dueDateInvoice);
    expect(text(explainPlanTemplate(some.views.keepFull, some.stock))).toContain(`cash elsewhere ${formatINR(75_000)}`);
  });

  it("explains when the worst day is not the payment day: sized to the peak", () => {
    // Right-sized at -30%, paying early: ₹2,91,349 short on day 7, but ₹3,30,719 short by day 10.
    const r = run({ salesDropPercent: 30 });
    const view = r.views.rightSized;
    const out = text(explainPlanTemplate(view, r.stock, { salesDropPercent: 30 }));
    expect(out).toContain("Shortfall on day 7 alone");
    expect(out).toContain(formatINR(291_349));
    expect(out).toContain("the worst day is day 10");
    expect(out).toContain(formatINR(330_719));
    expect(out).toContain("sized to that peak");
    expect(out).toContain("never goes below zero on any day up to day 10");
    expect(out).not.toContain("Expected gap:");
  });

  it("uses the simple 'Expected gap' line when the payment day is the worst day", () => {
    const r = run({}, dueDateInvoice);
    const out = text(explainPlanTemplate(r.views.keepFull, r.stock));
    expect(out).toContain("Expected gap:");
    expect(out).not.toContain("the worst day is");
  });

  it("when there is no gap, says how low the balance gets over the whole window", () => {
    const r = run({ cashElsewhere: 1_000_000 }, dueDateInvoice);
    const view = r.views.keepFull;
    // With cash to spare even a tiny discount is worth taking, so the plan being explained pays early:
    // the figure quoted is the lowest balance on THAT payment path.
    const path = view.recommended.timing === "pay_early_for_discount" ? view.earlyGap : view.gap;
    expect(path.scenarios.expected.gap).toBe(0);
    expect(text(explainPlanTemplate(view, r.stock))).toContain(
      `the lowest your balance gets on any day up to day 10 is ${formatINR(path.scenarios.expected.minBalance)}`,
    );
  });

  it("says plainly when there is no gap", () => {
    const r = run({ cashElsewhere: 1_000_000 }, dueDateInvoice);
    const out = text(explainPlanTemplate(r.views.keepFull, r.stock));
    expect(out).toContain("No gap");
    expect(out).not.toContain("Sources are used cheapest first");
  });

  it("warns when the plan does not cover the gap", () => {
    const r = run({}, { ...sampleInvoice, amount: 5_000_000, units: 5000 });
    const out = text(explainPlanTemplate(r.views.keepFull, r.stock));
    expect(out).toContain("Warning");
    expect(out).toContain("is not covered");
  });

  it("labels the data as simulated", () => {
    const r = run();
    expect(explainPlanTemplate(r.views.keepFull, r.stock)[0]).toContain("simulated");
  });
});
