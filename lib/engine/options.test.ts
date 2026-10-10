import { describe, expect, it } from "vitest";
import { merchant } from "../data/merchant";
import { sampleInvoice } from "../data/invoice";
import { computeGap } from "./gap";
import { runEngine } from "./index";
import {
  annualisedPct,
  buildFundingOptions,
  buildPlan,
  interestRate,
  type FundingOption,
} from "./options";
import { flatMerchant } from "./testing";

const flat = flatMerchant();
const expectedScenario = computeGap({ merchant: flat, invoice: sampleInvoice }).scenarios.expected;
const optionsFor = (extra = {}) =>
  buildFundingOptions({ merchant: flat, invoice: sampleInvoice, scenario: expectedScenario, ...extra });
const get = (opts: FundingOption[], id: string) => opts.find((o) => o.id === id)!;

describe("true cost of each option", () => {
  it("annualises early settlement: 0.30% for 2 days is 54.75% a year", () => {
    expect(annualisedPct(0.3, 2)).toBeCloseTo(54.75, 10);
    expect(get(optionsFor(), "early_settlement").annualisedPct).toBeCloseTo(54.75, 10);
  });

  it("early settlement costs 0.30% of the amount and is capped at money already earned", () => {
    const o = get(optionsFor(), "early_settlement");
    expect(o.costRate).toBeCloseTo(0.003, 10);
    expect(o.maxAmount).toBe(168_000);
    expect(o.isBorrowing).toBe(false);
  });

  it("credit line is 18% a year for the borrowing period", () => {
    const o = get(optionsFor(), "credit_line");
    expect(o.costRate).toBeCloseTo(interestRate(18, 30), 10);
    expect(Math.round(100_000 * o.costRate)).toBe(1_479);
    expect(o.isBorrowing).toBe(true);
  });

  it("bank overdraft defaults to 14% and the rate is editable", () => {
    const base = get(optionsFor(), "bank_overdraft");
    const edited = get(optionsFor({ overdraftRatePct: 20 }), "bank_overdraft");
    expect(base.annualisedPct).toBe(14);
    expect(edited.annualisedPct).toBe(20);
    expect(edited.costRate).toBeGreaterThan(base.costRate);
  });

  it("split order has no interest but carries a stock-out warning", () => {
    const o = get(optionsFor(), "split_order");
    expect(o.costRate).toBe(0);
    expect(o.note.toLowerCase()).toContain("run out");
  });

  it("supplier extension costs the late fee, or nothing if the supplier agrees", () => {
    expect(get(optionsFor(), "supplier_extension").costRate).toBeCloseTo(0.0075, 10); // 1.5%/month x 15 days
    expect(get(optionsFor({ supplierAgrees: true }), "supplier_extension").costRate).toBe(0);
  });

  it("ranks options by actual cost, cheapest first", () => {
    const rates = optionsFor().map((o) => o.costRate);
    expect(rates).toEqual([...rates].sort((a, b) => a - b));
  });
});

describe("recommended plan", () => {
  it("uses the cheapest sources first until the gap is covered", () => {
    const opts = optionsFor();
    const plan = buildPlan(250_000, opts);
    expect(plan.steps.map((s) => s.optionId)).toEqual(["split_order", "early_settlement"]);
    expect(plan.steps[0].amount).toBe(150_000); // 30% of the invoice, free
    expect(plan.steps[1].amount).toBe(100_000);
    expect(plan.steps[1].cost).toBe(300); // 0.30% of 1,00,000
    expect(plan.covered).toBe(250_000);
    expect(plan.uncovered).toBe(0);
    expect(plan.totalCost).toBe(300);
    expect(plan.borrowed).toBe(0);
  });

  it("steps are in non-decreasing cost order", () => {
    const opts = optionsFor();
    const plan = buildPlan(600_000, opts);
    const rates = plan.steps.map((s) => opts.find((o) => o.id === s.optionId)!.costRate);
    expect(rates).toEqual([...rates].sort((a, b) => a - b));
  });

  it("skips excluded options and falls back to the next cheapest", () => {
    const plan = buildPlan(250_000, optionsFor(), ["split_order", "early_settlement", "supplier_extension"]);
    // overdraft (14%) is cheaper than the credit line (18%), so it is used first
    expect(plan.steps.map((s) => s.optionId)).toEqual(["bank_overdraft", "credit_line"]);
    expect(plan.steps[0].amount).toBe(100_000);
    expect(plan.steps[1].amount).toBe(150_000);
    expect(plan.totalCost).toBe(1_151 + 2_219);
    expect(plan.borrowed).toBe(250_000);
  });

  it("reports what it could not cover", () => {
    const plan = buildPlan(5_000_000, optionsFor());
    expect(plan.uncovered).toBeGreaterThan(0);
    expect(plan.covered + plan.uncovered).toBe(5_000_000);
  });

  it("an empty gap needs no plan", () => {
    const plan = buildPlan(0, optionsFor());
    expect(plan.steps).toEqual([]);
    expect(plan.totalCost).toBe(0);
  });
});

describe("early-payment discount", () => {
  it("is worth taking in the sample: 2% (₹10,000) beats the small extra funding cost", () => {
    const r = runEngine({ merchant, invoice: sampleInvoice });
    expect(r.discount.discountAmount).toBe(10_000);
    expect(r.discount.daysEarly).toBe(3);
    expect(r.discount.netSaving).toBe(10_000 - r.discount.extraFundingCost);
    expect(r.discount.worthIt).toBe(true);
    expect(r.recommended.timing).toBe("pay_early_for_discount");
  });

  it("is not worth taking when the discount is tiny", () => {
    const stingy = { ...sampleInvoice, earlyPayDiscountPct: 0.01 };
    const r = runEngine({ merchant, invoice: stingy });
    expect(r.discount.worthIt).toBe(false);
    expect(r.recommended.timing).toBe("on_due_date");
  });
});

describe("whole engine on the sample data", () => {
  it("covers the expected gap without borrowing", () => {
    const r = runEngine({ merchant, invoice: sampleInvoice });
    expect(r.duePlan.gap).toBe(r.gap.gapExpected);
    expect(r.duePlan.uncovered).toBe(0);
    expect(r.duePlan.borrowed).toBe(0);
  });

  it("reruns everything for a sales drop: bigger gap, bigger plan", () => {
    const base = runEngine({ merchant, invoice: sampleInvoice });
    const drop = runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: 30 });
    expect(drop.gap.gapExpected).toBeGreaterThan(base.gap.gapExpected);
    expect(drop.duePlan.covered).toBeGreaterThan(base.duePlan.covered);
    expect(drop.duePlan.totalCost).toBeGreaterThanOrEqual(base.duePlan.totalCost);
  });

  it("lets the founder rule out options they don't want", () => {
    const r = runEngine({ merchant, invoice: sampleInvoice, exclude: ["split_order", "supplier_extension"] });
    expect(r.duePlan.steps.some((s) => s.optionId === "split_order")).toBe(false);
    expect(r.duePlan.uncovered).toBe(0);
  });
});
