import { describe, expect, it } from "vitest";
import { merchant } from "../data/merchant";
import { sampleInvoice } from "../data/invoice";
import { runEngine, runWhatIf } from "./index";

const run = (drop = 0, extra = {}) => runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: drop, ...extra });
const DROPS = [0, 10, 20, 30];
const CONFIRMED = ["early_settlement", "credit_line", "bank_overdraft", "split_order"];

describe("recommended plan uses confirmed sources only", () => {
  it.each(DROPS)("fully covers the gap at -%i% in both views, with no supplier extension", (drop) => {
    const r = run(drop);
    for (const view of [r.views.keepFull, r.views.rightSized]) {
      const plan = view.recommended.plan;
      expect(plan.fullyCovered).toBe(true);
      expect(plan.steps.length).toBeGreaterThan(0);
      for (const step of plan.steps) {
        expect(CONFIRMED).toContain(step.optionId);
        expect(step.optionId as string).not.toBe("supplier_extension");
      }
    }
  });

  it("the extension is never in the confirmed total", () => {
    const plan = run(0).recommended.recommended.plan;
    const stepsTotal = plan.steps.reduce((s, x) => s + x.amount, 0);
    expect(plan.covered).toBe(stepsTotal);
    expect(plan.covered).toBe(plan.gap); // fully covered without any extension
  });

  it("asking for more days never changes the plan, however many days", () => {
    const base = run(0, { extensionDays: 0 }).recommended.recommended.plan;
    for (const days of [5, 15, 45]) {
      expect(run(0, { extensionDays: days }).recommended.recommended.plan).toEqual(base);
    }
  });
});

describe("ask first: the supplier extension", () => {
  it("shows how much borrowing it would remove if the supplier agrees", () => {
    const ask = run(0).views.keepFull.askFirst;
    expect(ask.extraDays).toBe(15);
    expect(ask.borrowingIfPaidOnDueDate).toBeGreaterThan(0);
    expect(ask.borrowingIfExtended).toBeLessThan(ask.borrowingIfPaidOnDueDate);
    expect(ask.borrowingRemoved).toBe(ask.borrowingIfPaidOnDueDate - ask.borrowingIfExtended);
    expect(ask.borrowingRemoved).toBeGreaterThan(0);
  });

  it("says it removes nothing when the extra days don't help (never negative)", () => {
    // at -30% cash goes out faster than it comes in, so waiting longer makes the gap bigger
    const ask = run(30).views.keepFull.askFirst;
    expect(ask.borrowingRemoved).toBe(0);
  });

  it("shows the late fee only as the cost of missing the due date", () => {
    expect(run(0).views.keepFull.askFirst.lateFeeIfMissed).toBe(3_750);
  });

  it("uses the number of days asked for", () => {
    const short = run(0, { extensionDays: 3 }).views.keepFull.askFirst;
    const long = run(0, { extensionDays: 30 }).views.keepFull.askFirst;
    expect(short.extraDays).toBe(3);
    expect(long.lateFeeIfMissed).toBe(7_500);
    expect(long.borrowingRemoved).toBeGreaterThanOrEqual(short.borrowingRemoved);
  });
});

describe("what-if: two views", () => {
  const rows = runWhatIf({ merchant, invoice: sampleInvoice }, DROPS);

  it("(a) keep the full order: the gap grows as sales drop", () => {
    const gaps = rows.map((r) => r.keepFull.gapExpected);
    expect(gaps).toEqual([...gaps].sort((a, b) => a - b));
    expect(gaps[3]).toBeGreaterThan(gaps[0]);
    expect(rows.every((r) => r.keepFull.units === 500)).toBe(true);
  });

  it("(b) right-sized: the order shrinks as sales drop", () => {
    const units = rows.map((r) => r.rightSized.units);
    expect(units).toEqual([500, 468, 416, 364]);
    expect(rows[3].rightSized.orderValue).toBe(364_000);
  });

  it("at -30% the right-sized plan borrows far less than keeping the full order", () => {
    const r = rows[3];
    expect(r.rightSized.loan).toBeLessThan(r.keepFull.loan);
    // a lot less, not marginally
    expect(r.keepFull.loan - r.rightSized.loan).toBeGreaterThan(100_000);
  });

  it("right-sizing always borrows no more than keeping the full order", () => {
    for (const r of rows) expect(r.rightSized.loan).toBeLessThanOrEqual(r.keepFull.loan);
  });

  it("the loan grows far more slowly when the order is right-sized", () => {
    // NOTE: with these inputs the right-sized loan at -30% is still higher than at 0%,
    // because forecast cash-in falls by more than the order shrinks. See docs/ASSUMPTIONS.md.
    const growth = (key: "keepFull" | "rightSized") => rows[3][key].loan - rows[0][key].loan;
    expect(growth("rightSized")).toBeLessThan(growth("keepFull") / 2);
  });

  it("recommends (b) only when expected unsold stock is over 10% of the order", () => {
    expect(rows.map((r) => r.recommendedView)).toEqual([
      "keep_full", // 0% unsold
      "keep_full", // 6.4% unsold
      "right_sized", // 16.8% unsold
      "right_sized", // 27.2% unsold
    ]);
  });

  it("the recommended view is the one the engine hands back", () => {
    expect(run(10).recommendedView).toBe("keep_full");
    expect(run(10).recommended.id).toBe("keep_full");
    expect(run(30).recommendedView).toBe("right_sized");
    expect(run(30).recommended.id).toBe("right_sized");
  });

  it("with no unsold stock, both views are the same", () => {
    const r = run(0);
    expect(r.views.rightSized.units).toBe(r.views.keepFull.units);
    expect(r.views.rightSized.loan).toBe(r.views.keepFull.loan);
  });
});

describe("right-sized view uses the smaller invoice", () => {
  it("its gap is measured against the resized order", () => {
    const r = run(30);
    expect(r.views.rightSized.invoice.units).toBe(364);
    expect(r.views.rightSized.invoice.amount).toBe(364_000);
    expect(r.views.rightSized.gap.gapExpected).toBeLessThan(r.views.keepFull.gap.gapExpected);
  });
});
