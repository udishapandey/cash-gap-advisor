import { describe, expect, it } from "vitest";
import { merchant } from "./data/merchant";
import { defaultInvoice as sampleInvoice } from "./data/default-scenario";
import { runEngine, type EngineInput } from "./engine";
import {
  DEFAULT_JOURNEY,
  STEPS,
  approvalBlockers,
  approvalStage,
  buildKfs,
  canApprove,
  consentText,
  earlyPayDay,
  SOURCE_TAGS,
  needsCreditConsent,
  parseJourney,
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
    expect(DEFAULT_JOURNEY.overdraftRatePct).toBe(11);
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

  it("remembers the language, and falls back to English for anything unknown", () => {
    expect(DEFAULT_JOURNEY.language).toBe("en");
    expect(parseJourney({ ...withInvoice(), language: "hi" }).language).toBe("hi");
    for (const bad of ["fr", 3, null, undefined]) expect(parseJourney({ ...withInvoice(), language: bad }).language).toBe("en");
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
      expect(a.reason).toContain("bill");
    }
  });

  it("gap and options open with an invoice, approve only once a plan is chosen", () => {
    expect(stepAccess(withInvoice(), "gap").reachable).toBe(true);
    expect(stepAccess(withInvoice(), "options").reachable).toBe(true);
    const locked = stepAccess(withInvoice(), "approve");
    expect(locked.reachable).toBe(false);
    expect(locked.reason).toContain("Review a plan");
    expect(stepAccess(withInvoice({ chosenView: "keep_full" }), "approve").reachable).toBe(true);
  });

  it("Results is the last step, and only opens once the supplier has been paid", () => {
    expect(STEPS.map((x) => x.id)).toEqual(["invoice", "gap", "options", "approve", "results"]);
    expect(STEPS[STEPS.length - 1]).toMatchObject({ label: "Results", href: "/results" });
    for (const s of [DEFAULT_JOURNEY, withInvoice(), withInvoice({ chosenView: "keep_full" }), withInvoice({ chosenView: "keep_full", approved: true })]) {
      expect(stepAccess(s, "results").reachable).toBe(false);
    }
    expect(stepAccess(withInvoice({ chosenView: "keep_full", approved: true }), "results").reason).toContain("pay the supplier");
    const paid = withInvoice({ chosenView: "keep_full", approved: true, paid: true });
    expect(stepAccess(paid, "results").reachable).toBe(true);
    expect(stepStatus(paid, "results", "approve")).toBe("upcoming");
    expect(stepStatus(paid, "results", "results")).toBe("current");
    expect(stepStatus(withInvoice(), "results", "options")).toBe("locked");
    expect(stepComplete(paid, "results")).toBe(false);
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

describe("a plan split into non-credit actions and credit", () => {
  it("puts your own cash and paying early in non-credit, and the loans in credit", () => {
    const r = run();
    const sections = splitPlan(r.views.keepFull, r.stock.fullUnits);
    expect(r.views.keepFull.recommended.timing).toBe("pay_early_for_discount");
    expect(sections.nonCredit.map((a) => a.id)).toEqual(["pay_early", "own_cash"]);
    expect(sections.nonCredit[0].text).toContain("by day 10");
    expect(sections.nonCredit[0].amount).toBe(10_000);
    expect(sections.nonCredit[1].text).toContain("₹2,59,100");
    expect(sections.overdraft).toMatchObject({ amount: 100_000, cost: 208, closedDay: 18 });
    expect(sections.creditLine).toMatchObject({ amount: 130_900, cost: 209, closedDay: 15 });
  });

  it("has no order action: ordering fewer pairs is not part of paying the supplier", () => {
    const r = run({ salesDropPercent: 30 });
    expect(splitPlan(r.views.keepFull, r.stock.fullUnits).nonCredit.some((a) => a.id === "right_size_order")).toBe(false);
  });

  it("separates the partner credit line from the founder's own overdraft", () => {
    const r = run();
    const sections = splitPlan(r.views.keepFull, r.stock.fullUnits);
    expect(sections.overdraft?.optionId).toBe("bank_overdraft");
    expect(sections.creditLine?.optionId).toBe("credit_line");
    expect(sections.nonCredit.every((a) => a.id !== "credit_line" && a.id !== "bank_overdraft")).toBe(true);
  });
});

describe("paying the supplier", () => {
  it("is the discounted amount when the plan pays early", () => {
    const view = run().views.keepFull;
    expect(view.recommended.timing).toBe("pay_early_for_discount");
    expect(supplierPayment(view)).toBe(490_000);
    expect(earlyPayDay(view.invoice)).toBe(10);
  });

  it("is the full amount on the due date", () => {
    const view = runEngine({ merchant, invoice: dueDateInvoice }).views.keepFull;
    expect(view.recommended.timing).toBe("on_due_date");
    expect(supplierPayment(view)).toBe(500_000);
  });

  it("the credit line is out for the days it was really owed, not a fixed term", () => {
    expect(tenureDays(run().views.keepFull)).toBe(5);
  });
});

describe("Key Fact Statement (simulated)", () => {
  it("shows interest that exactly matches the engine's cost for the same loan", () => {
    const view = run().views.keepFull;
    const step = view.recommended.plan.steps.find((s) => s.optionId === "credit_line")!;
    const kfs = buildKfs(step.amount, tenureDays(view), step.cost);
    expect(kfs.totalInterest).toBe(step.cost);
    expect(kfs.loanAmount).toBe(step.amount);
    expect(kfs.tenureDays).toBe(5);
  });

  it("has every field the founder must see before borrowing", () => {
    const kfs = buildKfs(100_000, 30, 1_479);
    expect(kfs.lender).toBe("Partner NBFC (simulated)");
    expect(kfs.loanAmount).toBe(100_000);
    expect(kfs.annualRatePct).toBe(18);
    expect(kfs.totalInterest).toBe(1_479);
    expect(kfs.fees).toBe(0);
    expect(kfs.apr).toBe(18);
    expect(kfs.tenureDays).toBe(30);
    expect(kfs.totalRepayable).toBe(101_479);
    expect(kfs.schedule).toEqual([{ dayAfterDisbursement: 30, principal: 100_000, interest: 1_479, total: 101_479 }]);
    expect(kfs.disbursedTo).toContain("bank account");
    expect(kfs.disbursedTo).toContain("Never to the supplier");
    expect(kfs.grievance.officer).toContain("Grievance");
    expect(kfs.grievance.email).toContain("@");
    expect(kfs.grievance.phone).toBeTruthy();
    expect(kfs.coolingOffDays).toBeGreaterThan(0);
  });

  it("the repayment adds up: principal + interest + fees", () => {
    const kfs = buildKfs(250_000, 33, 4_000);
    expect(kfs.totalRepayable).toBe(kfs.loanAmount + kfs.totalInterest + kfs.fees);
    expect(kfs.schedule[0].total).toBe(kfs.totalRepayable);
  });

  it("writes consent text with the amount, rate, repayment and days, and says there is no pre-closure charge", () => {
    const text = consentText(buildKfs(100_000, 30, 1_479));
    expect(text).toContain("₹1,00,000");
    expect(text).toContain("18%");
    expect(text).toContain("₹1,01,479");
    expect(text).toContain("30 days");
    expect(text).toContain("Partner NBFC (simulated)");
    expect(text).toContain("no pre-closure charge");
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

  it("needs consent when the partner credit line is used, and the approval waits for it", () => {
    const r = run();
    const sections = splitPlan(r.views.keepFull, r.stock.fullUnits);
    expect(needsCreditConsent(sections)).toBe(true);
    expect(canApprove({ view: r.views.keepFull, sections, consent: false })).toBe(false);
    expect(canApprove({ view: r.views.keepFull, sections, consent: true })).toBe(true);
  });

  it("needs no consent when nothing is borrowed from the partner", () => {
    const r = run({ cashElsewhere: 400_000 });
    const sections = splitPlan(r.views.keepFull, r.stock.fullUnits);
    expect(sections.creditLine).toBeNull();
    expect(needsCreditConsent(sections)).toBe(false);
    expect(canApprove({ view: r.views.keepFull, sections, consent: false })).toBe(true);
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

describe("who provides each source", () => {
  it("tags your own cash and the bank overdraft as not Razorpay, and the credit line as Razorpay's", () => {
    expect(SOURCE_TAGS.own_cash.razorpay).toBe(false);
    expect(SOURCE_TAGS.bank_overdraft).toEqual({ label: "Your own bank, not Razorpay", razorpay: false });
    expect(SOURCE_TAGS.credit_line.razorpay).toBe(true);
    expect(SOURCE_TAGS.credit_line.label).toContain("simulated");
    expect(SOURCE_TAGS.early_settlement.razorpay).toBe(true);
    expect(SOURCE_TAGS.split_order.razorpay).toBe(false);
  });

  it("in the demo, the cheaper overdraft is used before the credit line", () => {
    const steps = run().views.keepFull.recommended.plan.steps.map((s) => s.optionId);
    expect(steps.indexOf("bank_overdraft")).toBeLessThan(steps.indexOf("credit_line"));
  });
});
