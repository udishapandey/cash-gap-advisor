import { describe, expect, it } from "vitest";
import { merchant } from "../data/merchant";
import { sampleInvoice } from "../data/invoice";
import { amountDueOn, codArrivalShare, computeGap } from "./gap";
import { runEngine } from "./index";
import { flatMerchant } from "./testing";

describe("COD arrival timing (12-13 day payout delay)", () => {
  const delay = { min: 12, max: 13 };
  it("pays an order placed today in full by day 13, none before day 12", () => {
    expect(codArrivalShare(0, 11, delay)).toBe(0);
    expect(codArrivalShare(0, 12, delay)).toBeCloseTo(0.5);
    expect(codArrivalShare(0, 13, delay)).toBe(1);
  });
  it("ignores cash that already landed before today", () => {
    expect(codArrivalShare(-13, 20, delay)).toBe(0);
    expect(codArrivalShare(-12, 20, delay)).toBeCloseTo(0.5);
  });
});

// Hand-checked case: sales every day are ₹60k prepaid + ₹40k COD, balance ₹1L, other outflows ₹1L/day, no safety
// buffer, paying on day 10 with the window ending that day.
const hand = (extra: object = {}) => ({ merchant: flatMerchant(), invoice: sampleInvoice, byDay: 10, windowEnd: 10, buffer: 0, ...extra });

describe("gap on the discount deadline (hand-checked with flat sales)", () => {
  it("expected scenario matches the hand calculation", () => {
    const { expected } = computeGap(hand()).scenarios;
    expect(expected.cash.bankBalance).toBe(100_000);
    expect(expected.cash.settlementsInTransit).toBe(120_000); // 2 days x 60k
    expect(expected.cash.forecastPrepaid).toBe(672_000); // 8 days x 60k x 1.4
    // COD placed on days -12 (half), -11..-3 (all) and -2 (half) lands by day 10: 10 days x 40k x (1 - 30% returns)
    expect(expected.cash.codPayouts).toBe(280_000);
    expect(expected.cash.totalIn).toBe(1_172_000);
    expect(expected.invoiceDue).toBe(490_000); // 2% off, paid within 10 days
    expect(expected.cashOut).toBe(1_490_000); // 4.9L + 10 days x 1L
    expect(expected.gap).toBe(318_000);
  });

  it("gives a range: low sales -> biggest gap, high sales -> smallest", () => {
    const g = computeGap(hand());
    expect(g.gapMax).toBe(462_000); // 1.1x
    expect(g.gapExpected).toBe(318_000); // 1.4x
    expect(g.gapMin).toBe(174_000); // 1.7x
  });

  it("caps instant settlement at prepaid sales already earned", () => {
    expect(computeGap(hand()).scenarios.expected.earnedNotSettled).toBe(168_000); // last 2 days x 60k x 1.4
  });

  it("adds the safety buffer to the money to find", () => {
    const withBuffer = computeGap(hand({ buffer: 50_000 }));
    expect(withBuffer.gapExpected).toBe(368_000);
  });

  it("reports a surplus, not a negative gap, when cash is plentiful", () => {
    const rich = computeGap(hand({ merchant: flatMerchant({ otherOutflowsPerDay: 0 }) })).scenarios.expected;
    expect(rich.gap).toBe(0);
    expect(rich.surplus).toBeGreaterThan(0);
  });
});

describe("low-confidence flag", () => {
  it("is on when the range is wider than 40% of the invoice", () => {
    const g = computeGap(hand());
    expect(g.widthShare).toBeCloseTo(0.576, 4);
    expect(g.lowConfidence).toBe(true);
  });
  it("is off when the range is narrow relative to the invoice", () => {
    const g = computeGap(hand({ invoice: { ...sampleInvoice, amount: 5_000_000 } }));
    expect(g.widthShare).toBeCloseTo(0.0576, 4);
    expect(g.lowConfidence).toBe(false);
  });
});

describe("what-if: salesDropPercent", () => {
  it("0% changes nothing", () => {
    expect(computeGap(hand({ salesDropPercent: 0 }))).toEqual(computeGap(hand()));
  });
  it("rescales the forecast and reruns (50% drop, hand-checked)", () => {
    const { expected } = computeGap(hand({ salesDropPercent: 50 })).scenarios;
    expect(expected.cash.forecastPrepaid).toBe(336_000);
    expect(expected.cash.codPayouts).toBe(280_000); // COD that lands by day 10 was ordered before today
    expect(expected.gap).toBe(654_000);
  });
  it("only changes the forecast, never past sales already in transit", () => {
    const { expected } = computeGap(hand({ salesDropPercent: 30 })).scenarios;
    expect(expected.cash.settlementsInTransit).toBe(120_000);
  });
  it("makes the gap bigger as sales drop: -10% < -20% < -30%", () => {
    const gap = (d: number) => computeGap({ merchant, invoice: sampleInvoice, byDay: 10, salesDropPercent: d }).gapExpected;
    expect(gap(0)).toBeLessThan(gap(10));
    expect(gap(10)).toBeLessThan(gap(20));
    expect(gap(20)).toBeLessThan(gap(30));
  });
});

describe("gap for the sample merchant and invoice", () => {
  const g = computeGap({ merchant, invoice: sampleInvoice, byDay: 10 });
  it("expected gap is about ₹2-2.5L on the discount deadline, as in the spec's demo", () => {
    expect(g.gapExpected).toBeGreaterThanOrEqual(200_000);
    expect(g.gapExpected).toBeLessThanOrEqual(250_000);
  });
  it("is low confidence, because the range is wide", () => {
    expect(g.lowConfidence).toBe(true);
  });
  it("needs no borrowing at all if the bill is paid on the due date", () => {
    expect(computeGap({ merchant, invoice: sampleInvoice }).gapExpected).toBe(0);
  });
});

describe("early-payment discount in the amount due (2/10 net 30)", () => {
  it("applies 2% only on or before day 10", () => {
    expect(amountDueOn(sampleInvoice, 10)).toBe(490_000);
    expect(amountDueOn(sampleInvoice, 11)).toBe(500_000);
    expect(amountDueOn(sampleInvoice, 30)).toBe(500_000);
  });
});

describe("cash available elsewhere", () => {
  it("adds to cash in, one for one, and shrinks the gap by the same amount", () => {
    const base = computeGap(hand());
    const more = computeGap(hand({ cashElsewhere: 50_000 }));
    expect(more.scenarios.expected.cash.cashElsewhere).toBe(50_000);
    expect(more.scenarios.expected.cash.totalIn).toBe(base.scenarios.expected.cash.totalIn + 50_000);
    expect(more.gapExpected).toBe(base.gapExpected - 50_000); // 318,000 -> 268,000
    expect(more.gapMax).toBe(base.gapMax - 50_000);
    expect(more.gapMin).toBe(base.gapMin - 50_000);
  });
  it("never lets a gap go below zero: extra cash beyond the gap becomes a surplus", () => {
    const more = computeGap(hand({ cashElsewhere: 400_000 }));
    expect(more.gapMin).toBe(0);
    expect(more.scenarios.high.surplus).toBe(226_000);
  });
  it("defaults to zero and ignores a negative amount", () => {
    const base = computeGap(hand());
    expect(base.scenarios.expected.cash.cashElsewhere).toBe(0);
    expect(computeGap(hand({ cashElsewhere: -500 }))).toEqual(base);
  });
  it("turns a gap into a surplus once it is big enough", () => {
    const g = computeGap(hand({ cashElsewhere: 400_000 }));
    expect(g.gapExpected).toBe(0);
    expect(g.scenarios.expected.surplus).toBe(82_000);
  });
  it("reaches the whole engine, so the plan shrinks too", () => {
    const base = runEngine({ merchant, invoice: sampleInvoice });
    const more = runEngine({ merchant, invoice: sampleInvoice, cashElsewhere: 150_000 });
    expect(more.views.keepFull.focusGap.gapExpected).toBe(base.views.keepFull.focusGap.gapExpected - 150_000);
    expect(more.views.keepFull.loan).toBeLessThan(base.views.keepFull.loan);
  });
});

describe("salesVsForecast (used after the season, to see what the real need was)", () => {
  const base = { merchant, invoice: sampleInvoice, byDay: 10 };
  it("defaults to 1: no change", () => {
    expect(computeGap({ ...base, salesVsForecast: 1 }).gapExpected).toBe(computeGap(base).gapExpected);
  });
  it("lower actual sales mean a bigger gap, higher a smaller one, and it can go above 1 unlike the what-if drop", () => {
    const g = (x: number) => computeGap({ ...base, salesVsForecast: x }).gapExpected;
    expect(g(0.85)).toBeGreaterThan(g(1));
    expect(g(1.15)).toBeLessThan(g(1));
    expect(g(1.5)).toBeLessThan(g(1.15));
  });
  it("multiplies the what-if drop: -20% and then 0.5x is the same as 0.4x of the base forecast", () => {
    const a = computeGap({ ...base, salesDropPercent: 20, salesVsForecast: 0.5 }).gapExpected;
    const b = computeGap({ ...base, salesDropPercent: 60 }).gapExpected;
    expect(a).toBe(b);
  });
  it("ignores a negative value", () => {
    expect(computeGap({ ...base, salesVsForecast: -3 }).gapExpected).toBe(computeGap({ ...base, salesVsForecast: 0 }).gapExpected);
  });
});
