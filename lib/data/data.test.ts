import { describe, expect, it } from "vitest";
import { merchant } from "./merchant";
import { sampleInvoice } from "./invoice";
import { CONFIG } from "../engine/config";

describe("simulated merchant data", () => {
  const total = merchant.dailyOrders.reduce((s, r) => s + r.prepaidValue + r.codValue, 0);
  const prepaid = merchant.dailyOrders.reduce((s, r) => s + r.prepaidValue, 0);

  it("is marked simulated", () => {
    expect(merchant.simulated).toBe(true);
    expect(sampleInvoice.simulated).toBe(true);
  });

  it("has 90 consecutive days ending today", () => {
    expect(merchant.dailyOrders).toHaveLength(90);
    expect(merchant.dailyOrders[0].day).toBe(-89);
    expect(merchant.dailyOrders[89].day).toBe(0);
  });

  it("sells about ₹30L a month", () => {
    const monthly = total / 3;
    expect(monthly).toBeGreaterThan(2_800_000);
    expect(monthly).toBeLessThan(3_200_000);
  });

  it("is about 60% prepaid and 40% COD", () => {
    expect(prepaid / total).toBeCloseTo(0.6, 1);
  });

  it("matches the brief's headline numbers", () => {
    expect(merchant.bankBalance).toBe(150_000);
    expect(merchant.settlementDays).toBe(2);
    expect(merchant.codPayoutDelayDays).toEqual({ min: 5, max: 9 });
    expect(merchant.codReturnRate).toBe(0.2);
  });

  it("shows last year's Diwali uplift of ~1.4x, same as the expected scenario", () => {
    const { baselineDailySales, festiveDailySales, uplift } = merchant.lastYearFestive;
    expect(festiveDailySales / baselineDailySales).toBeCloseTo(1.4, 5);
    expect(uplift).toBe(CONFIG.scenarioUplift.expected);
  });

  it("has the sample invoice from the brief", () => {
    expect(sampleInvoice.amount).toBe(500_000);
    expect(sampleInvoice.dueInDays).toBe(10);
    expect(sampleInvoice.earlyPayDiscountPct).toBe(2);
    expect(sampleInvoice.earlyPayWithinDays).toBe(7);
    expect(sampleInvoice.lateFeePctPerMonth).toBe(1.5);
  });
});
