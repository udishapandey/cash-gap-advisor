import { describe, expect, it } from "vitest";
import { defaultInvoice } from "../data/default-scenario";
import { merchant } from "../data/merchant";
import { runEngine } from "./index";
import { computeOutcome, midSeasonCheck, SIMULATED_OUTCOMES, type OutcomeId, type OutcomeInput } from "./outcome";

const r = runEngine({ merchant, invoice: defaultInvoice });
const input = (): Omit<OutcomeInput, "actual"> => ({
  approved: r.views.keepFull,
  fullOrder: r.views.keepFull,
  stock: r.stock,
  merchant,
  salesDropPercent: 0,
  cashElsewhere: 0,
});
const outcome = (id: OutcomeId) => computeOutcome({ ...input(), actual: SIMULATED_OUTCOMES[id] });

describe("outcome: one headline saving on one basis", () => {
  it("as forecast, the plan saves the discount less its interest: ₹10,000 - ₹417 = ₹9,583", () => {
    const o = outcome("as_forecast");
    expect(o.cost.plan).toMatchObject({ fundsCost: 417, discountCaptured: 10_000, netCost: -9_583 });
    expect(o.cost.default.fundsCost).toBe(0);
    expect(o.cost.moneySaved).toBe(9_583);
  });
  it("saving = default cost - plan cost, exactly, in every season", () => {
    for (const id of ["as_forecast", "lower_15", "higher_15"] as const) {
      const o = outcome(id);
      expect(o.cost.moneySaved).toBe(o.cost.default.netCost - o.cost.plan.netCost);
      expect(o.cost.moneySaved).toBe(o.cost.fromCheaperFunding + o.cost.plan.discountCaptured);
    }
  });
  it("lower sales cost more interest but the plan is still ahead of the usual way", () => {
    const o = outcome("lower_15");
    expect(o.cost.plan.fundsCost).toBe(2_253);
    expect(o.cost.default.fundsCost).toBe(372);
    expect(o.cost.moneySaved).toBe(8_119);
  });
  it("higher sales cost less interest", () => {
    expect(outcome("higher_15").cost.moneySaved).toBe(9_911);
  });
});

describe("outcome: forecast gap against actual gap", () => {
  it("as forecast: no difference", () => {
    expect(outcome("as_forecast").gap).toEqual({ forecast: 230_900, actual: 230_900, difference: 0 });
  });
  it("15% lower: the gap grows by ₹1,16,930, which comes out of the backup credit", () => {
    const o = outcome("lower_15");
    expect(o.gap).toEqual({ forecast: 230_900, actual: 347_830, difference: 116_930 });
    expect(o.borrowing.extraCredit).toBe(116_930);
    expect(o.borrowing.beyondBackup).toBe(0);
  });
  it("15% higher: the gap shrinks", () => {
    expect(outcome("higher_15").gap.difference).toBeLessThan(0);
  });
});

describe("outcome: what the system learns", () => {
  it("moves its festive-uplift estimate partway toward what it saw, by the learning rate", () => {
    const l = outcome("lower_15").learned;
    expect(l.uplift.after).toBeLessThan(l.uplift.before);
    expect(l.uplift.after).toBeGreaterThan(l.uplift.observed);
  });
  it("leaves the estimates alone when sales matched the forecast", () => {
    const l = outcome("as_forecast").learned;
    expect(l.uplift.after).toBe(l.uplift.before);
  });
});

describe("mid-season check (day 15, sales 15% below forecast)", () => {
  const m = midSeasonCheck({ ...input(), actual: SIMULATED_OUTCOMES.lower_15 });
  it("reports sales 15% below, and the updated gap", () => {
    expect(m.day).toBe(15);
    expect(m.vsForecastPercent).toBe(-15);
    expect(m.forecastGap).toBe(230_900);
    expect(m.updatedGap).toBe(347_830);
    expect(m.cashInActual).toBeLessThan(m.cashInForecast);
  });
  it("says exactly what changes: more credit on day 10, the backup used, repayment moved from day 18 to day 40", () => {
    expect(m.nothingChanges).toBe(false);
    expect(m.changes).toEqual([
      { kind: "withdraw_credit", amount: 116_930, day: 10 },
      { kind: "backup_used", amount: 116_930 },
      { kind: "repay_later", from: 18, to: 40 },
    ]);
  });
  it("changes nothing when sales are on forecast", () => {
    const same = midSeasonCheck({ ...input(), actual: SIMULATED_OUTCOMES.as_forecast });
    expect(same.nothingChanges).toBe(true);
    expect(same.changes).toEqual([]);
  });
});
