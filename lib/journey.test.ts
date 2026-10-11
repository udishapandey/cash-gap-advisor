import { describe, expect, it } from "vitest";
import { merchant } from "./data/merchant";
import { sampleInvoice } from "./data/invoice";
import { runEngine, type EngineInput } from "./engine";
import {
  DEFAULT_JOURNEY,
  approvalBlockers,
  approvalStage,
  buildKfs,
  canApprove,
  consentText,
  earlyPayDay,
  earlySettlementInsight,
  needsCreditConsent,
  parseJourney,
  quoteOption,
  rangeBarLayout,
  splitPlan,
  stepAccess,
  stepComplete,
  stepStatus,
  supplierPayment,
  tenureDays,
  type JourneyState,
} from "./journey";

const run = (extra: Partial<EngineInput> = {}) => runEngine({ merchant, invoice: sampleInvoice, ...extra });
// An invoice whose discount is tiny, so the plan pays on the due date.
const dueDateInvoice = { ...sampleInvoice, earlyPayDiscountPct: 0.01 };
const withInvoice = (over: Partial<JourneyState> = {}): JourneyState => ({ ...DEFAULT_JOURNEY, invoice: sampleInvoice, ...over });

describe("journey state", () => {
  it("starts with nothing chosen, approved or paid", () => {
    expect(DEFAULT_JOURNEY).toMatchObject({ invoice: null, chosenView: null, approved: false, paid: false });
    expect(DEFAULT_JOURNEY.salesDropPercent).toBe(0);
    expect(DEFAULT_JOURNEY.overdraftRatePct).toBe(14);
  });

  it("restores saved state", () => {
    const saved = { ...withInvoice({ salesDropPercent: 20, cashElsewhere: 50000, chosenView: "right_sized" }) };
    expect(parseJourney(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it.each([null, undefined, "x", 42, [], {}])("falls back to the default for %j", (raw) => {
    expect(parseJourney(raw)).toEqual(DEFAULT_JOURNEY);
  });

  it("keeps the good fields when one field is bad", () => {
    const s = parseJourney({ ...withInvoice(), salesDropPercent: "lots", cashElsewhere: -5, chosenView: "somewhere" });
    expect(s.invoice).toEqual(sampleInvoice);
    expect(s.salesDropPercent).toBe(0);
    expect(s.cashElsewhere).toBe(0);
    expect(s.chosenView).toBeNull();
  });

  it("drops an invalid invoice", () => {
    expect(parseJourney({ ...withInvoice(), invoice: { amount: "five lakh" } }).invoice).toBeNull();
  });

  it("never restores an approval without an invoice and a chosen plan, or a payment without approval", () => {
    expect(parseJourney({ ...DEFAULT_JOURNEY, approved: true, paid: true })).toMatchObject({ approved: false, paid: false });
    expect(parseJourney({ ...withInvoice(), approved: true })).toMatchObject({ approved: false });
    expect(parseJourney({ ...withInvoice({ chosenView: "keep_full" }), paid: true })).toMatchObject({ approved: false, paid: false });
    expect(parseJourney(withInvoice({ chosenView: "keep_full", approved: true, paid: true }))).toMatchObject({
      approved: true,
      paid: true,
    });
  });
});

describe("which steps can be opened", () => {
  it("only the invoice step before an invoice is confirmed", () => {
    expect(stepAccess(DEFAULT_JOURNEY, "invoice").reachable).toBe(true);
    for (const step of ["gap", "options", "approve"] as const) {
      const a = stepAccess(DEFAULT_JOURNEY, step);
      expect(a.reachable).toBe(false);
      expect(a.reason).toContain("invoice");
    }
  });

  it("gap and options open with an invoice, approve only once a plan is chosen", () => {
    expect(stepAccess(withInvoice(), "gap").reachable).toBe(true);
    expect(stepAccess(withInvoice(), "options").reachable).toBe(true);
    const locked = stepAccess(withInvoice(), "approve");
    expect(locked.reachable).toBe(false);
    expect(locked.reason).toContain("Choose a plan");
    expect(stepAccess(withInvoice({ chosenView: "keep_full" }), "approve").reachable).toBe(true);
  });

  it("labels steps as done, current, upcoming or locked", () => {
    const s = withInvoice();
    expect(stepStatus(s, "gap", "gap")).toBe("current");
    expect(stepStatus(s, "invoice", "gap")).toBe("done");
    expect(stepStatus(s, "options", "gap")).toBe("upcoming");
    expect(stepStatus(s, "approve", "gap")).toBe("locked");
    expect(stepStatus(DEFAULT_JOURNEY, "gap", "invoice")).toBe("locked");
    expect(stepStatus(s, "options", null)).toBe("upcoming"); // outside the journey
  });

  it("only ticks a step once its work is really done, not just because it comes earlier", () => {
    // No invoice yet: the invoice step must not look finished while you are on a later page.
    expect(stepStatus(DEFAULT_JOURNEY, "invoice", "gap")).toBe("upcoming");
    expect(stepStatus(DEFAULT_JOURNEY, "invoice", null)).toBe("upcoming");
    // Invoice confirmed but no plan chosen: options is not done even when viewed from approve.
    const s = withInvoice();
    expect(stepStatus(s, "options", "approve")).toBe("upcoming");
    expect(stepStatus(withInvoice({ chosenView: "keep_full" }), "options", "approve")).toBe("done");
    // Going back: a completed later step is not shown as done.
    expect(stepStatus(withInvoice({ chosenView: "keep_full" }), "options", "gap")).toBe("upcoming");
  });

  it("knows when each step is complete", () => {
    expect(stepComplete(DEFAULT_JOURNEY, "invoice")).toBe(false);
    expect(stepComplete(withInvoice(), "invoice")).toBe(true);
    expect(stepComplete(withInvoice(), "gap")).toBe(true);
    expect(stepComplete(withInvoice(), "options")).toBe(false);
    expect(stepComplete(withInvoice({ chosenView: "right_sized" }), "options")).toBe(true);
    expect(stepComplete(withInvoice({ chosenView: "right_sized", approved: true }), "approve")).toBe(false);
    expect(stepComplete(withInvoice({ chosenView: "right_sized", approved: true, paid: true }), "approve")).toBe(true);
  });
});

describe("option cards", () => {
  const options = run().views.keepFull.options;
  const get = (id: string) => options.find((o) => o.id === id)!;

  it("quotes the cost of covering the gap with that option alone, up to its cap", () => {
    const early = get("early_settlement");
    const q = quoteOption(early, 227_621);
    expect(q.available).toBe(true);
    expect(q.cap).toBe(early.maxAmount);
    expect(q.covers).toBe(Math.min(227_621, early.maxAmount));
    expect(q.cost).toBe(Math.round(q.covers * 0.003));
  });

  it("covers only the gap when the cap is bigger than the gap", () => {
    const credit = get("credit_line");
    const q = quoteOption(credit, 100_000);
    expect(q.covers).toBe(100_000);
    expect(q.cost).toBe(1_479); // 100,000 at 18% a year for 30 days
  });

  it("is unavailable when the cap is zero", () => {
    const q = quoteOption({ ...get("early_settlement"), maxAmount: 0 }, 50_000);
    expect(q).toMatchObject({ available: false, covers: 0, cost: 0 });
  });

  it("shows the 'looks cheap' insight: 0.30% is about 55% a year", () => {
    expect(earlySettlementInsight(get("early_settlement"))).toBe("0.30% ≈ 55% a year here");
    expect(earlySettlementInsight({ ...get("early_settlement"), annualisedPct: null })).toBeNull();
  });
});

describe("a plan split into non-credit actions and credit", () => {
  it("puts early settlement and paying early in non-credit, and loans in credit", () => {
    const r = run();
    const sections = splitPlan(r.views.keepFull, r.stock.fullUnits);
    expect(r.views.keepFull.recommended.timing).toBe("pay_early_for_discount");
    expect(sections.nonCredit.map((a) => a.id)).toEqual(["pay_early", "early_settlement"]);
    expect(sections.nonCredit[0].text).toContain("by day 7");
    expect(sections.nonCredit[0].amount).toBe(10_000);
    // Early settlement and the ₹1L overdraft are used up first; a small partner credit line covers the rest.
    expect(sections.overdraft).toMatchObject({ amount: 100_000 });
    expect(sections.creditLine).toMatchObject({ amount: 17_164, cost: 279 });
  });

  it("describes a right-sized order as an action, with the cash saved", () => {
    const r = run({ salesDropPercent: 30 });
    const sections = splitPlan(r.views.rightSized, r.stock.fullUnits);
    const order = sections.nonCredit.find((a) => a.id === "right_size_order")!;
    expect(order.text).toBe("Order 364 of 500 pairs now (73%)");
    expect(order.amount).toBe(136_000);
  });

  it("has no order action when the full order is kept", () => {
    const r = run({ salesDropPercent: 30 });
    expect(splitPlan(r.views.keepFull, r.stock.fullUnits).nonCredit.some((a) => a.id === "right_size_order")).toBe(false);
  });

  it("separates the partner credit line from the founder's own overdraft", () => {
    const r = run({ exclude: ["early_settlement"], salesDropPercent: 30 });
    const sections = splitPlan(r.views.keepFull, r.stock.fullUnits);
    expect(sections.overdraft?.optionId).toBe("bank_overdraft");
    expect(sections.creditLine?.optionId).toBe("credit_line");
    expect(sections.nonCredit.every((a) => a.id !== "credit_line" && a.id !== "bank_overdraft")).toBe(true);
  });

  it("describes a deferred delivery in pairs", () => {
    const r = run({ exclude: ["early_settlement", "credit_line", "bank_overdraft"], salesDropPercent: 0 });
    const sections = splitPlan(r.views.rightSized, r.stock.fullUnits);
    const split = sections.nonCredit.find((a) => a.id === "split_order");
    expect(split?.text).toMatch(/^Have \d+ pairs delivered later$/);
  });
});

describe("paying the supplier", () => {
  it("is the discounted amount when the plan pays early", () => {
    const view = run().views.keepFull;
    expect(view.recommended.timing).toBe("pay_early_for_discount");
    expect(supplierPayment(view)).toBe(490_000);
    expect(tenureDays(view)).toBe(33); // 30 days plus the 3 days early
    expect(earlyPayDay(view.invoice)).toBe(7);
  });

  it("is the full amount on the due date", () => {
    const view = runEngine({ merchant, invoice: dueDateInvoice }).views.keepFull;
    expect(view.recommended.timing).toBe("on_due_date");
    expect(supplierPayment(view)).toBe(500_000);
    expect(tenureDays(view)).toBe(30);
  });

  it("follows the right-sized order", () => {
    const view = run({ salesDropPercent: 30 }).views.rightSized;
    expect(supplierPayment(view)).toBeLessThan(364_000 + 1);
    expect(supplierPayment(view)).toBeGreaterThan(300_000);
  });
});

describe("Key Fact Statement (simulated)", () => {
  const forced = () => {
    // Force a plan that uses the partner credit line, so the engine and the statement can be compared.
    const r = run({ exclude: ["early_settlement", "bank_overdraft"] });
    const view = r.views.keepFull;
    const step = view.recommended.plan.steps.find((s) => s.optionId === "credit_line")!;
    return { view, step };
  };

  it("shows interest that exactly matches the engine's cost for the same loan", () => {
    const { view, step } = forced();
    const kfs = buildKfs(step.amount, tenureDays(view));
    expect(kfs.totalInterest).toBe(step.cost);
    expect(kfs.loanAmount).toBe(step.amount);
  });

  it("has every field the founder must see before borrowing", () => {
    const kfs = buildKfs(100_000, 30);
    expect(kfs.lender).toBe("Partner NBFC (simulated)");
    expect(kfs.loanAmount).toBe(100_000);
    expect(kfs.annualRatePct).toBe(18);
    expect(kfs.totalInterest).toBe(1_479);
    expect(kfs.fees).toBe(0);
    expect(kfs.apr).toBe(18);
    expect(kfs.tenureDays).toBe(30);
    expect(kfs.totalRepayable).toBe(101_479);
    expect(kfs.schedule).toEqual([{ dayAfterDisbursement: 30, principal: 100_000, interest: 1_479, total: 101_479 }]);
    expect(kfs.disbursedTo).toContain("own bank account");
    expect(kfs.disbursedTo).toContain("Never to the supplier");
    expect(kfs.grievance.officer).toContain("Grievance");
    expect(kfs.grievance.email).toContain("@");
    expect(kfs.grievance.phone).toBeTruthy();
    expect(kfs.coolingOffDays).toBeGreaterThan(0);
  });

  it("the repayment adds up: principal + interest + fees", () => {
    const kfs = buildKfs(250_000, 33);
    expect(kfs.totalRepayable).toBe(kfs.loanAmount + kfs.totalInterest + kfs.fees);
    expect(kfs.schedule[0].total).toBe(kfs.totalRepayable);
  });

  it("charges more interest for a longer tenure", () => {
    expect(buildKfs(100_000, 33).totalInterest).toBeGreaterThan(buildKfs(100_000, 30).totalInterest);
  });

  it("writes consent text with the amount, rate, repayment and days", () => {
    const text = consentText(buildKfs(100_000, 30));
    expect(text).toContain("₹1,00,000");
    expect(text).toContain("18%");
    expect(text).toContain("₹1,01,479");
    expect(text).toContain("30 days");
    expect(text).toContain("Partner NBFC (simulated)");
  });
});

describe("approval rules", () => {
  it("moves from review to pay to done", () => {
    expect(approvalStage({ approved: false, paid: false })).toBe("review");
    expect(approvalStage({ approved: true, paid: false })).toBe("pay");
    expect(approvalStage({ approved: true, paid: true })).toBe("done");
    expect(approvalStage({ approved: false, paid: true })).toBe("review"); // payment never skips approval
  });

  it("blocks a plan that doesn't cover the gap, and says by how much", () => {
    const view = runEngine({ merchant, invoice: { ...sampleInvoice, amount: 5_000_000, units: 5000 } }).views.keepFull;
    const blockers = approvalBlockers(view);
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toContain("not covered");
    expect(canApprove({ view, sections: splitPlan(view, 5000), consent: true })).toBe(false);
  });

  it("lets a fully covered plan through", () => {
    const view = run().views.keepFull;
    expect(approvalBlockers(view)).toEqual([]);
  });

  it("needs consent only when the partner credit line is used", () => {
    const r = run({ exclude: ["early_settlement", "bank_overdraft"] });
    expect(r.views.keepFull.recommended.plan.fullyCovered).toBe(true);
    const withCredit = splitPlan(r.views.keepFull, r.stock.fullUnits);
    expect(needsCreditConsent(withCredit)).toBe(true);
    expect(canApprove({ view: r.views.keepFull, sections: withCredit, consent: false })).toBe(false);
    expect(canApprove({ view: r.views.keepFull, sections: withCredit, consent: true })).toBe(true);

    // Early settlement and your own overdraft only: no partner credit, so nothing to consent to.
    const base = run({ exclude: ["credit_line"], cashElsewhere: 20_000 });
    const noCredit = splitPlan(base.views.keepFull, base.stock.fullUnits);
    expect(noCredit.creditLine).toBeNull();
    expect(needsCreditConsent(noCredit)).toBe(false);
    expect(canApprove({ view: base.views.keepFull, sections: noCredit, consent: false })).toBe(true);
  });

  it("the founder's own overdraft never needs the partner's consent", () => {
    const r = run({ exclude: ["early_settlement", "credit_line"] });
    const sections = splitPlan(r.views.keepFull, r.stock.fullUnits);
    expect(sections.overdraft).not.toBeNull();
    expect(needsCreditConsent(sections)).toBe(false);
  });
});

describe("range bar layout", () => {
  it("places the best case, expected and worst case in order along the bar", () => {
    const l = rangeBarLayout(51_637, 227_621, 403_605);
    expect(l.bestPct).toBeLessThan(l.expectedPct);
    expect(l.expectedPct).toBeLessThan(l.worstPct);
    expect(l.worstPct).toBeCloseTo(100 / 1.15, 5); // leaves room past the worst case
    expect(l.bestPct).toBeGreaterThan(0);
  });
  it("keeps every marker inside the bar", () => {
    const l = rangeBarLayout(0, 100, 100);
    for (const v of [l.bestPct, l.expectedPct, l.worstPct]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
  it("handles no gap at all without dividing by zero", () => {
    expect(rangeBarLayout(0, 0, 0)).toEqual({ max: 0, bestPct: 0, expectedPct: 0, worstPct: 0 });
  });
});
