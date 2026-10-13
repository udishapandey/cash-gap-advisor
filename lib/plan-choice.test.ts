import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultInvoice } from "./data/default-scenario";
import { merchant } from "./data/merchant";
import { SAMPLE_BILLS } from "./data/sample-bills";
import { runEngine } from "./engine";
import { parseConfirmed, toEngineInvoice, toFormValues } from "./invoice-extraction";
import { DEFAULT_JOURNEY, buildKfs, canApprove, needsCreditConsent, parseJourney, splitPlan, supplierPayment, tenureDays } from "./journey";
import { CANCEL_NOTE, buildHeroPlan, homeAlert, paymentIsScheduled, planChoiceCards, timeLabels, whoDoesWhat } from "./plain";
import { canChooseDueDate, pickPlan, pickResult } from "./plan-choice";
import { outcomeForState } from "./results";

const state = { salesDropPercent: 0, cashElsewhere: 0 };
const bill1 = () => runEngine({ merchant, invoice: defaultInvoice });
const bill2 = () => {
  const form = parseConfirmed(toFormValues(SAMPLE_BILLS[1].extraction));
  if (!form.ok) throw new Error("bill 2 form");
  const m = toEngineInvoice(form.data);
  if (!m.ok) throw new Error(m.error);
  return runEngine({ merchant, invoice: m.invoice });
};

describe("the two cards for bill 1", () => {
  const cards = planChoiceCards(bill1(), state);
  it("are the recommended plan and paying on the due date, in that order", () => {
    expect(cards.map((c) => [c.choice, c.recommended])).toEqual([
      ["recommended", true],
      ["due_date", false],
    ]);
  });
  it("show the recommended plan's numbers unchanged: ₹10,000 off, borrow ₹2.31L for 8 days, ₹417, net ₹9,583", () => {
    expect(cards[0]).toMatchObject({ title: "Pay on 21 Oct", discount: "₹10,000 off", borrowing: "₹2.31L for 8 days", cost: "₹417", net: "₹9,583" });
  });
  it("show paying on the due date: 10 Nov, no discount, no borrowing, ₹0 cost", () => {
    expect(cards[1]).toMatchObject({ title: "Pay on 10 Nov", discount: "No discount", borrowing: "No borrowing", cost: "₹0", net: "₹0" });
  });
  it("leave the headline numbers alone", () => {
    const r = bill1();
    const hero = buildHeroPlan(r, r.recommendedView, 9_583);
    expect(hero.discount).toBe(10_000);
    expect(hero.totalCost).toBe(417);
    expect(hero.saving).toBe(9_583);
  });
});

describe("choosing a card carries into Approve", () => {
  const r = bill1();
  it("the recommended card: Razorpay credit and overdraft, a Key Fact Statement and a consent, ₹4,90,000 on 21 Oct", () => {
    const view = pickPlan(r.recommended, "recommended");
    const sections = splitPlan(view, r.stock.fullUnits);
    expect(supplierPayment(view)).toBe(490_000);
    expect(sections.creditLine).toMatchObject({ amount: 130_900, closedDay: 15 });
    expect(sections.overdraft).toMatchObject({ amount: 100_000, closedDay: 18 });
    expect(needsCreditConsent(sections)).toBe(true);
    expect(canApprove({ view, sections, consent: false })).toBe(false);
    expect(buildKfs(sections.creditLine!.amount, tenureDays(view), sections.creditLine!.cost).totalInterest).toBe(209);
  });
  it("the due-date card: the no-borrowing path, no Key Fact Statement, no consent, nothing to repay, ₹5,00,000 on 10 Nov", () => {
    const view = pickPlan(r.recommended, "due_date");
    const sections = splitPlan(view, r.stock.fullUnits);
    expect(view.recommended.timing).toBe("on_due_date");
    expect(supplierPayment(view)).toBe(500_000);
    expect(sections.creditLine).toBeNull();
    expect(sections.overdraft).toBeNull();
    expect(needsCreditConsent(sections)).toBe(false);
    expect(canApprove({ view, sections, consent: false })).toBe(true);
    expect(view.recommended.plan.totalCost).toBe(0);
    expect(view.discount.discountAmount).toBe(0);
  });
  it("pickResult swaps the choice into the whole result and leaves the original alone", () => {
    const picked = pickResult(r, "due_date");
    expect(picked.recommended.recommended.timing).toBe("on_due_date");
    expect(picked.views.keepFull.recommended.timing).toBe("on_due_date");
    expect(r.recommended.recommended.timing).toBe("pay_early_for_discount");
    expect(pickResult(r, "recommended")).toBe(r);
  });
});

describe("Results reflects the chosen plan", () => {
  const r = bill1();
  const chosen = (planChoice: "recommended" | "due_date") => outcomeForState(r, { chosenView: "keep_full", ...state, planChoice }, "as_forecast")!;
  it("recommended: the discount less ₹417, ₹9,583 better off", () => {
    expect(chosen("recommended").cost).toMatchObject({ moneySaved: 9_583, plan: { fundsCost: 417, discountCaptured: 10_000 } });
  });
  it("due date: no discount, no cost, nothing saved", () => {
    expect(chosen("due_date").cost).toMatchObject({ moneySaved: 0, plan: { fundsCost: 0, discountCaptured: 0 } });
  });
});

describe("when there is no real choice", () => {
  it("a recommendation that already pays on the due date gets one card", () => {
    const r = runEngine({ merchant, invoice: defaultInvoice, salesDropPercent: 10 });
    expect(r.recommended.recommended.timing).toBe("on_due_date");
    expect(canChooseDueDate(r.recommended)).toBe(false);
    const cards = planChoiceCards(r, { salesDropPercent: 10, cashElsewhere: 0 });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ choice: "recommended", recommended: true, title: "Pay on 10 Nov" });
    expect(pickPlan(r.recommended, "due_date")).toBe(r.recommended); // a stale choice changes nothing
  });
  it("bill 2 pays early from cash, so it has two cards: take the ₹4,050 or pay on 28 Nov", () => {
    const cards = planChoiceCards(bill2(), state);
    expect(cards.map((c) => c.title)).toEqual(["Pay on 29 Oct", "Pay on 28 Nov"]);
    expect(cards[0]).toMatchObject({ discount: "₹4,050 off", borrowing: "No borrowing", cost: "₹0", net: "₹4,050" });
    expect(cards[1]).toMatchObject({ discount: "No discount", borrowing: "No borrowing", cost: "₹0", net: "₹0" });
  });
});

describe("the saved choice", () => {
  it("starts as the recommended plan, and survives a reload", () => {
    expect(DEFAULT_JOURNEY.planChoice).toBe("recommended");
    expect(parseJourney({ ...DEFAULT_JOURNEY, planChoice: "due_date" }).planChoice).toBe("due_date");
    expect(parseJourney({ ...DEFAULT_JOURNEY, planChoice: "something else" }).planChoice).toBe("recommended");
  });
});

describe("who does what on Approve", () => {
  const r = bill1();
  it("the recommended plan: Razorpay draws the credit and pays the supplier, the founder moves the overdraft", () => {
    expect(whoDoesWhat(pickPlan(r.recommended, "recommended"))).toEqual({
      razorpay: ["Draw ₹1.31L from your Razorpay credit line on 21 Oct", "Pay Shree Ganesh Footwear ₹4.90L on 21 Oct"],
      you: ["Move ₹1.00L from your bank overdraft into your RazorpayX account by 21 Oct"],
    });
  });
  it("paying on the due date: Razorpay pays the supplier and the founder has nothing to do", () => {
    expect(whoDoesWhat(pickPlan(r.recommended, "due_date"))).toEqual({
      razorpay: ["Pay Shree Ganesh Footwear ₹5.00L on 10 Nov"],
      you: [],
    });
  });
  it("lists no credit or overdraft row when the plan uses none (bill 2, cash only)", () => {
    const who = whoDoesWhat(bill2().recommended);
    expect(who.razorpay).toEqual(["Pay Kaveri Soles & Uppers ₹2.66L on 29 Oct"]);
    expect(who.you).toEqual([]);
  });
});

describe("time labels and cancelling", () => {
  const r = bill1();
  it("Approve says when it is scheduled for, the paid screen says it is simulated, Results says how many days later", () => {
    const v = pickPlan(r.recommended, "recommended");
    expect(timeLabels.scheduledFor(v)).toBe("Scheduled for 21 Oct");
    expect(timeLabels.paidOn(v)).toBe("On 21 Oct (simulated)");
    expect(timeLabels.daysLater(v)).toBe("Simulated: 18 days later");
    expect(timeLabels.daysLater(pickPlan(r.recommended, "due_date"))).toBe("Simulated: 30 days later");
  });
  it("a payment dated after today can be cancelled", () => {
    expect(paymentIsScheduled(r.recommended)).toBe(true);
    expect(CANCEL_NOTE).toBe("Payment cancelled. Nothing was paid or borrowed.");
  });
  it("Cancel scheduled payment is on the approval step and on the paid step, and sends the founder back to the plan with the note", () => {
    const a = readFileSync("components/ApproveScreen.tsx", "utf8");
    expect(a.match(/Cancel scheduled payment/g)).toHaveLength(2);
    expect(a).toContain('router.push("/options")');
    expect(a).toContain("update({ approved: false, paid: false, chosenView: null, cancelled: true })");
    const o = readFileSync("components/OptionsScreen.tsx", "utf8");
    expect(o).toContain("{state.cancelled && <Alert");
    expect(o).toContain("CANCEL_NOTE");
    expect(readFileSync("components/ResultsScreen.tsx", "utf8")).toContain("timeLabels.daysLater(chosen)");
  });
});

describe("the cancelled note is saved with the journey", () => {
  it("is off to begin with, survives a reload, and is cleared by a new bill or a changed number", () => {
    expect(DEFAULT_JOURNEY.cancelled).toBe(false);
    expect(parseJourney({ ...DEFAULT_JOURNEY, cancelled: true }).cancelled).toBe(true);
    expect(parseJourney({ ...DEFAULT_JOURNEY, cancelled: "yes" }).cancelled).toBe(false);
    const p = readFileSync("components/JourneyProvider.tsx", "utf8");
    expect(p.match(/cancelled: false/g)!.length).toBeGreaterThanOrEqual(3);
  });
});

describe("the Home headline", () => {
  it("is the net saving with its working: ₹9,583 = ₹10,000 discount − ₹417 interest, the same figures as the Plan", () => {
    const r = bill1();
    const a = homeAlert(r, 9_583);
    expect(a.title).toBe("Save ₹9,583");
    expect(a.breakdown).toBe("₹10,000 discount − ₹417 interest");
    const hero = buildHeroPlan(r, r.recommendedView, 9_583);
    expect([hero.discount, hero.totalCost, hero.saving]).toEqual([10_000, 417, 9_583]);
  });
  it("has no breakdown when no discount is taken", () => {
    const r = runEngine({ merchant, invoice: defaultInvoice, salesDropPercent: 10 });
    expect(homeAlert(r, 0).breakdown).toBeNull();
  });
});
