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
  lateFeeIfMissed,
  type FundingOption,
} from "./options";
import { flatMerchant } from "./testing";

const flat = flatMerchant();
const expectedScenario = computeGap({ merchant: flat, invoice: sampleInvoice }).scenarios.expected;
const optionsFor = (extra = {}) =>
  buildFundingOptions({
    merchant: flat,
    invoice: sampleInvoice,
    scenario: expectedScenario,
    demandUnits: 520,
    ...extra,
  });
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

  it("split order is priced as expected lost margin, not as free", () => {
    const o = get(optionsFor(), "split_order");
    // 150 pairs deferred, all would sell at 520 demand, ₹680 margin each
    expect(o.stockOut?.expectedLostMargin).toBe(102_000);
    expect(o.costRate).toBeCloseTo(0.68, 10);
    expect(o.isBorrowing).toBe(false);
  });

  it("has no supplier extension: it is never a confirmed source", () => {
    const ids = optionsFor().map((o) => o.id as string);
    expect(ids).not.toContain("supplier_extension");
    expect(ids.sort()).toEqual(["bank_overdraft", "credit_line", "early_settlement", "split_order"]);
  });

  it("ranks options by actual cost, cheapest first", () => {
    const rates = optionsFor().map((o) => o.costRate);
    expect(rates).toEqual([...rates].sort((a, b) => a - b));
  });
});

describe("late fee is the cost of missing the due date", () => {
  it("is 1.5% a month on the invoice, pro-rated", () => {
    expect(lateFeeIfMissed(sampleInvoice, 15)).toBe(3_750); // 5,00,000 x 1.5% x 15/30
    expect(lateFeeIfMissed(sampleInvoice, 30)).toBe(7_500);
  });
});

describe("recommended plan", () => {
  it("uses the cheapest confirmed sources first until the gap is covered", () => {
    const opts = optionsFor();
    const plan = buildPlan(250_000, opts);
    expect(plan.steps.map((s) => s.optionId)).toEqual(["early_settlement", "bank_overdraft"]);
    expect(plan.steps[0].amount).toBe(168_000); // capped at sales already earned
    expect(plan.steps[0].cost).toBe(504); // 0.30% of 1,68,000
    expect(plan.steps[1].amount).toBe(82_000);
    expect(plan.steps[1].cost).toBe(944); // 14% a year for 30 days
    expect(plan.covered).toBe(250_000);
    expect(plan.uncovered).toBe(0);
    expect(plan.fullyCovered).toBe(true);
    expect(plan.totalCost).toBe(504 + 944);
    expect(plan.borrowed).toBe(82_000); // early settlement is not a loan
  });

  it("steps are in non-decreasing cost order", () => {
    const opts = optionsFor();
    const plan = buildPlan(600_000, opts);
    const rates = plan.steps.map((s) => opts.find((o) => o.id === s.optionId)!.costRate);
    expect(rates).toEqual([...rates].sort((a, b) => a - b));
  });

  it("skips excluded options and falls back to the next cheapest", () => {
    const plan = buildPlan(250_000, optionsFor(), ["early_settlement", "split_order"]);
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
    expect(plan.fullyCovered).toBe(false);
    expect(plan.covered + plan.uncovered).toBe(5_000_000);
  });

  it("an empty gap needs no plan", () => {
    const plan = buildPlan(0, optionsFor());
    expect(plan.steps).toEqual([]);
    expect(plan.totalCost).toBe(0);
    expect(plan.fullyCovered).toBe(true);
  });
});

describe("early-payment discount", () => {
  it("is worth taking in the sample: 2% (₹10,000) beats the extra funding cost", () => {
    const { discount, recommended } = runEngine({ merchant, invoice: sampleInvoice }).views.keepFull;
    expect(discount.discountAmount).toBe(10_000);
    expect(discount.daysEarly).toBe(3);
    expect(discount.netSaving).toBe(10_000 - discount.extraFundingCost);
    expect(discount.worthIt).toBe(true);
    expect(recommended.timing).toBe("pay_early_for_discount");
  });

  it("is not worth taking when the discount is tiny", () => {
    const stingy = { ...sampleInvoice, earlyPayDiscountPct: 0.01 };
    const { discount, recommended } = runEngine({ merchant, invoice: stingy }).views.keepFull;
    expect(discount.worthIt).toBe(false);
    expect(recommended.timing).toBe("on_due_date");
  });
});
