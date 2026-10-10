import { describe, expect, it } from "vitest";
import { merchant } from "../data/merchant";
import { sampleInvoice } from "../data/invoice";
import { amountDueOn, codArrivalShare, computeGap } from "./gap";
import { flatMerchant } from "./testing";

describe("COD arrival timing (5-9 day payout delay)", () => {
  const delay = { min: 5, max: 9 };
  it("pays an order placed today in full by day 9, none before day 5", () => {
    expect(codArrivalShare(0, 4, delay)).toBe(0);
    expect(codArrivalShare(0, 7, delay)).toBeCloseTo(0.6);
    expect(codArrivalShare(0, 10, delay)).toBe(1);
  });
  it("ignores cash that already landed before today", () => {
    expect(codArrivalShare(-9, 10, delay)).toBe(0);
    expect(codArrivalShare(-6, 10, delay)).toBeCloseTo(0.6);
  });
});

describe("gap by the due date (hand-checked with flat sales)", () => {
  // Sales every day: ₹60k prepaid + ₹40k COD. Balance ₹1L. Other outflows ₹1L/day.
  const m = flatMerchant();

  it("expected scenario matches the hand calculation", () => {
    const { expected } = computeGap({ merchant: m, invoice: sampleInvoice }).scenarios;
    expect(expected.cash.bankBalance).toBe(100_000);
    expect(expected.cash.settlementsInTransit).toBe(120_000); // 2 days x 60k
    expect(expected.cash.forecastPrepaid).toBe(672_000); // 8 days x 60k x 1.4
    expect(expected.cash.codPayouts).toBe(358_400); // (280k + 168k) x (1 - 20% returns)
    expect(expected.cash.totalIn).toBe(1_250_400);
    expect(expected.cashOut).toBe(1_500_000); // 5L invoice + 10 days x 1L
    expect(expected.gap).toBe(249_600);
  });

  it("gives a range: low sales -> biggest gap, high sales -> smallest", () => {
    const g = computeGap({ merchant: m, invoice: sampleInvoice });
    expect(g.gapMax).toBe(422_400); // 1.1x
    expect(g.gapExpected).toBe(249_600); // 1.4x
    expect(g.gapMin).toBe(76_800); // 1.7x
    expect(g.gapMin).toBeLessThan(g.gapExpected);
    expect(g.gapExpected).toBeLessThan(g.gapMax);
  });

  it("caps early-settlement money at prepaid sales already earned", () => {
    const { expected } = computeGap({ merchant: m, invoice: sampleInvoice }).scenarios;
    expect(expected.earnedNotSettled).toBe(168_000); // last 2 days x 60k x 1.4
  });

  it("reports a surplus, not a negative gap, when cash is plentiful", () => {
    const rich = flatMerchant({ otherOutflowsPerDay: 0 });
    const { expected } = computeGap({ merchant: rich, invoice: sampleInvoice }).scenarios;
    expect(expected.gap).toBe(0);
    expect(expected.surplus).toBeGreaterThan(0);
  });
});

describe("low-confidence flag", () => {
  it("is on when the range is wider than 40% of the invoice", () => {
    const g = computeGap({ merchant: flatMerchant(), invoice: sampleInvoice });
    expect(g.widthShare).toBeCloseTo(0.6912, 4);
    expect(g.lowConfidence).toBe(true);
  });
  it("is off when the range is narrow relative to the invoice", () => {
    const big = { ...sampleInvoice, amount: 5_000_000 };
    const g = computeGap({ merchant: flatMerchant(), invoice: big });
    expect(g.widthShare).toBeLessThan(0.4);
    expect(g.lowConfidence).toBe(false);
  });
});

describe("what-if: salesDropPercent", () => {
  const m = flatMerchant();
  it("0% changes nothing", () => {
    expect(computeGap({ merchant: m, invoice: sampleInvoice, salesDropPercent: 0 })).toEqual(
      computeGap({ merchant: m, invoice: sampleInvoice }),
    );
  });
  it("rescales the forecast and reruns (50% drop, hand-checked)", () => {
    const { expected } = computeGap({ merchant: m, invoice: sampleInvoice, salesDropPercent: 50 }).scenarios;
    expect(expected.cash.forecastPrepaid).toBe(336_000);
    expect(expected.cash.codPayouts).toBe(291_200); // history is unchanged, forecast halves
    expect(expected.gap).toBe(652_800);
  });
  it("only changes the forecast, never past sales already in transit", () => {
    const { expected } = computeGap({ merchant: m, invoice: sampleInvoice, salesDropPercent: 30 }).scenarios;
    expect(expected.cash.settlementsInTransit).toBe(120_000);
  });
  it("makes the gap bigger as sales drop: -10% < -20% < -30%", () => {
    const gap = (d: number) => computeGap({ merchant: merchant, invoice: sampleInvoice, salesDropPercent: d }).gapExpected;
    expect(gap(0)).toBeLessThan(gap(10));
    expect(gap(10)).toBeLessThan(gap(20));
    expect(gap(20)).toBeLessThan(gap(30));
  });
});

describe("gap for the sample merchant and invoice", () => {
  const g = computeGap({ merchant, invoice: sampleInvoice });
  it("expected gap is about ₹2-2.5L, as in the spec's demo", () => {
    expect(g.gapExpected).toBeGreaterThanOrEqual(200_000);
    expect(g.gapExpected).toBeLessThanOrEqual(250_000);
  });
  it("is low confidence, because the range is wide", () => {
    expect(g.lowConfidence).toBe(true);
  });
});

describe("early-payment discount in the amount due", () => {
  it("applies 2% only on or before day 7", () => {
    expect(amountDueOn(sampleInvoice, 7)).toBe(490_000);
    expect(amountDueOn(sampleInvoice, 8)).toBe(500_000);
    expect(amountDueOn(sampleInvoice, 10)).toBe(500_000);
  });
});
