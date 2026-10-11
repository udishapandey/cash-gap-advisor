import { describe, expect, it } from "vitest";
import { merchant } from "../data/merchant";
import { sampleInvoice } from "../data/invoice";
import { runEngine, type EngineResult, type ViewId } from "./index";
import { CONFIG } from "./config";
import { computeOutcome, OUTCOME_IDS, SIMULATED_OUTCOMES, type ActualOutcome } from "./outcome";

const DROPS = [0, 10, 20, 25, 30];
const run = (drop = 0, cashElsewhere = 0) => runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: drop, cashElsewhere });
const outcomeFor = (r: EngineResult, view: ViewId, actual: ActualOutcome, drop = 0, cashElsewhere = 0) =>
  computeOutcome({
    approved: view === "right_sized" ? r.views.rightSized : r.views.keepFull,
    fullOrder: r.views.keepFull,
    stock: r.stock,
    merchant,
    salesDropPercent: drop,
    cashElsewhere,
    actual,
  });
const VIEWS: ViewId[] = ["keep_full", "right_sized"];

describe("the simulated outcomes", () => {
  it("are three, labelled as the screen shows them", () => {
    expect(OUTCOME_IDS).toEqual(["as_forecast", "lower_15", "higher_15"]);
    expect(SIMULATED_OUTCOMES.as_forecast.label).toBe("Sales as forecast");
    expect(SIMULATED_OUTCOMES.lower_15.label).toBe("15% lower");
    expect(SIMULATED_OUTCOMES.higher_15.label).toBe("15% higher");
    expect(SIMULATED_OUTCOMES.lower_15.salesVsForecast).toBe(0.85);
    expect(SIMULATED_OUTCOMES.higher_15.salesVsForecast).toBe(1.15);
  });
  it("'as forecast' returns exactly the COD return rate the forecast assumed", () => {
    expect(SIMULATED_OUTCOMES.as_forecast.codReturnRate).toBe(merchant.codReturnRate);
  });
});

describe("money saved", () => {
  it("is EXACTLY the default cost minus the plan cost, for every outcome, slider value and plan", () => {
    for (const drop of DROPS) {
      const r = run(drop);
      for (const view of VIEWS) {
        for (const id of OUTCOME_IDS) {
          const o = outcomeFor(r, view, SIMULATED_OUTCOMES[id], drop);
          expect(o.cost.moneySaved, `${view} ${id} -${drop}%`).toBe(o.cost.default.netCost - o.cost.plan.netCost);
        }
      }
    }
  });

  it("uses the founder's default: draw the whole gap on the credit line, pay on the due date, no discount", () => {
    const r = run(0);
    const o = outcomeFor(r, "keep_full", SIMULATED_OUTCOMES.as_forecast);
    const credit = r.views.keepFull.options.find((x) => x.id === "credit_line")!;
    expect(o.cost.default.amount).toBe(r.views.keepFull.duePlan.gap);
    expect(o.cost.default.fundsCost).toBe(Math.round(r.views.keepFull.duePlan.gap * credit.costRate));
    expect(o.cost.default.netCost).toBe(o.cost.default.fundsCost); // never takes the discount
  });

  it("the plan's net cost is its funds cost minus the discount it earned", () => {
    const r = run(0);
    const o = outcomeFor(r, "keep_full", SIMULATED_OUTCOMES.as_forecast);
    const view = r.views.keepFull;
    expect(view.recommended.timing).toBe("pay_early_for_discount");
    expect(o.cost.plan.fundsCost).toBe(view.recommended.plan.totalCost);
    expect(o.cost.plan.discountCaptured).toBe(view.discount.discountAmount);
    expect(o.cost.plan.netCost).toBe(o.cost.plan.fundsCost - o.cost.plan.discountCaptured);
  });

  it("is positive for the demo plan, and says when the default could not really be drawn", () => {
    expect(outcomeFor(run(0), "keep_full", SIMULATED_OUTCOMES.as_forecast).cost.moneySaved).toBeGreaterThan(0);
    const big = outcomeFor(run(25), "right_sized", SIMULATED_OUTCOMES.as_forecast, 25);
    expect(big.cost.default.amount).toBeGreaterThan(merchant.creditLineLimit);
    expect(big.cost.default.exceedsCreditLimit).toBe(true);
    expect(outcomeFor(run(0), "keep_full", SIMULATED_OUTCOMES.as_forecast).cost.default.exceedsCreditLimit).toBe(false);
  });

  it("is zero when nothing needs funding and the plan takes no discount", () => {
    const r = runEngine({ merchant, invoice: { ...sampleInvoice, earlyPayDiscountPct: 0 }, cashElsewhere: 5_000_000 });
    const o = computeOutcome({ approved: r.views.keepFull, fullOrder: r.views.keepFull, stock: r.stock, merchant, salesDropPercent: 0, cashElsewhere: 5_000_000, actual: SIMULATED_OUTCOMES.as_forecast });
    expect(o.cost.default.fundsCost).toBe(0);
    expect(o.cost.plan.netCost).toBe(0);
    expect(o.cost.moneySaved).toBe(0);
  });
});

describe("actual sales against the forecast range", () => {
  it("'as forecast' is exactly the expected forecast and inside the range", () => {
    const o = outcomeFor(run(0), "keep_full", SIMULATED_OUTCOMES.as_forecast);
    expect(o.sales.actualPairs).toBe(o.sales.forecastPairs.expected);
    expect(o.sales.vsForecastPercent).toBe(0);
    expect(o.sales.insideRange).toBe(true);
    expect(o.sales.forecastPairs.low).toBeLessThan(o.sales.forecastPairs.expected);
    expect(o.sales.forecastPairs.expected).toBeLessThan(o.sales.forecastPairs.high);
  });

  it("15% lower and 15% higher are signed and still inside the low-to-high range", () => {
    for (const drop of DROPS) {
      const r = run(drop);
      const lo = outcomeFor(r, "keep_full", SIMULATED_OUTCOMES.lower_15, drop);
      const hi = outcomeFor(r, "keep_full", SIMULATED_OUTCOMES.higher_15, drop);
      expect(lo.sales.vsForecastPercent).toBe(-15);
      expect(hi.sales.vsForecastPercent).toBe(15);
      expect(lo.sales.insideRange, `-${drop}%`).toBe(true);
      expect(hi.sales.insideRange, `-${drop}%`).toBe(true);
      expect(lo.sales.actualPairs).toBeLessThan(lo.sales.forecastPairs.expected);
      expect(hi.sales.actualPairs).toBeGreaterThan(hi.sales.forecastPairs.expected);
    }
  });

  it("reports OUTSIDE the range when sales are far off the forecast", () => {
    const r = run(0);
    const poor = outcomeFor(r, "keep_full", { salesVsForecast: 0.7, codReturnRate: 0.25 });
    const boom = outcomeFor(r, "keep_full", { salesVsForecast: 1.3, codReturnRate: 0.15 });
    expect(poor.sales.insideRange).toBe(false);
    expect(boom.sales.insideRange).toBe(false);
  });

  it("gives the same figures in rupees at the simulated selling price", () => {
    const o = outcomeFor(run(0), "keep_full", SIMULATED_OUTCOMES.as_forecast);
    expect(o.sales.actualRupees).toBe(Math.round(o.sales.actualPairs * CONFIG.stock.sellingPricePerPair));
  });
});

describe("pairs sold and left over", () => {
  it("sold + left over = ordered, and you can't sell more than you ordered or than customers wanted", () => {
    for (const drop of DROPS) {
      const r = run(drop);
      for (const view of VIEWS) {
        for (const id of OUTCOME_IDS) {
          const o = outcomeFor(r, view, SIMULATED_OUTCOMES[id], drop);
          expect(o.stock.sold + o.stock.leftOver, `${view} ${id} -${drop}%`).toBe(o.stock.ordered);
          expect(o.stock.sold).toBeLessThanOrEqual(o.stock.ordered);
          expect(o.stock.sold).toBeLessThanOrEqual(Math.floor(o.sales.actualPairs));
          expect(o.stock.leftOver).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("weak sales leave pairs over; strong sales sell out and miss sales", () => {
    const r = run(25);
    const lo = outcomeFor(r, "right_sized", SIMULATED_OUTCOMES.lower_15, 25);
    const hi = outcomeFor(r, "right_sized", SIMULATED_OUTCOMES.higher_15, 25);
    expect(lo.stock.leftOver).toBeGreaterThan(0);
    expect(lo.stock.missedPairs).toBe(0);
    expect(hi.stock.leftOver).toBe(0);
    expect(hi.stock.missedPairs).toBe(hi.sales.actualPairs - hi.stock.ordered);
  });

  it("right-sizing leaves fewer pairs over than keeping the full order would have", () => {
    const o = outcomeFor(run(25), "right_sized", SIMULATED_OUTCOMES.as_forecast, 25);
    expect(o.stock.ordered).toBeLessThan(sampleInvoice.units);
    expect(o.stock.leftOverIfFullOrder).toBeGreaterThan(o.stock.leftOver);
  });
});

describe("unnecessary borrowing (the guardrail)", () => {
  it("is zero, and nothing is uncovered, when sales and returns are as forecast", () => {
    for (const drop of DROPS) {
      const r = run(drop);
      for (const view of VIEWS) {
        const o = outcomeFor(r, view, SIMULATED_OUTCOMES.as_forecast, drop);
        expect(o.borrowing.actualPeakNeed, `${view} -${drop}%`).toBe(o.borrowing.plannedPeakNeed);
        expect(o.borrowing.unnecessary).toBe(0);
        expect(o.borrowing.underFunded).toBe(0);
        expect(o.cost.plan.topUpCost).toBe(0);
      }
    }
  });

  it("is positive when sales come in higher: the loan was bigger than the real need", () => {
    const r = run(0);
    const o = outcomeFor(r, "keep_full", SIMULATED_OUTCOMES.higher_15);
    expect(o.borrowing.actualPeakNeed).toBeLessThan(o.borrowing.plannedPeakNeed);
    expect(o.borrowing.unnecessary).toBeGreaterThan(0);
    expect(o.borrowing.unnecessary).toBeLessThanOrEqual(o.borrowing.borrowed);
    expect(o.borrowing.underFunded).toBe(0);
  });

  it("says so, and prices the top-up, when sales come in lower: the plan left the real need uncovered", () => {
    const r = run(0);
    const o = outcomeFor(r, "keep_full", SIMULATED_OUTCOMES.lower_15);
    expect(o.borrowing.actualPeakNeed).toBeGreaterThan(o.borrowing.plannedPeakNeed);
    expect(o.borrowing.underFunded).toBeGreaterThan(0);
    expect(o.borrowing.unnecessary).toBe(0);
    expect(o.cost.plan.topUpCost).toBeGreaterThan(0);
    expect(o.cost.plan.fundsCost).toBe(r.views.keepFull.recommended.plan.totalCost + o.cost.plan.topUpCost);
  });

  it("is never negative, never more than was borrowed, and never at the same time as an uncovered need", () => {
    for (const drop of DROPS) {
      for (const cash of [0, 100_000]) {
        const r = run(drop, cash);
        for (const view of VIEWS) {
          for (const actual of [...OUTCOME_IDS.map((id) => SIMULATED_OUTCOMES[id]), { salesVsForecast: 0.6, codReturnRate: 0.3 }, { salesVsForecast: 1.5, codReturnRate: 0.1 }]) {
            const o = outcomeFor(r, view, actual, drop, cash);
            const label = `${view} x${actual.salesVsForecast} -${drop}% cash ${cash}`;
            expect(o.borrowing.unnecessary, label).toBeGreaterThanOrEqual(0);
            expect(o.borrowing.unnecessary, label).toBeLessThanOrEqual(o.borrowing.borrowed);
            expect(o.borrowing.underFunded, label).toBeGreaterThanOrEqual(0);
            expect(o.borrowing.unnecessary > 0 && o.borrowing.underFunded > 0, label).toBe(false);
          }
        }
      }
    }
  });
});

describe("what the system learned", () => {
  it("moves the festive uplift part of the way toward what was seen (a 15% miss: 1.4x becomes about 1.3x)", () => {
    const o = outcomeFor(run(0), "keep_full", SIMULATED_OUTCOMES.lower_15);
    const { before, observed, after, vsEstimatePercent } = o.learned.uplift;
    expect(before).toBe(CONFIG.scenarioUplift.expected);
    expect(observed).toBe(1.19);
    expect(vsEstimatePercent).toBe(-15);
    expect(after).toBe(Math.round((before + CONFIG.learningRate * (observed - before)) * 100) / 100);
    expect(after).toBeCloseTo(1.3, 1);
    expect(after).toBeGreaterThan(observed);
    expect(after).toBeLessThan(before);
  });

  it("moves up when sales were higher, and stays put when sales were as forecast", () => {
    expect(outcomeFor(run(0), "keep_full", SIMULATED_OUTCOMES.higher_15).learned.uplift.after).toBeGreaterThan(1.4);
    const same = outcomeFor(run(0), "keep_full", SIMULATED_OUTCOMES.as_forecast).learned;
    expect(same.uplift.after).toBe(1.4);
    expect(same.codReturnRate.updatedPercent).toBe(same.codReturnRate.assumedPercent);
  });

  it("compares the observed COD return rate with the assumed one, and updates it", () => {
    const lo = outcomeFor(run(0), "keep_full", SIMULATED_OUTCOMES.lower_15).learned.codReturnRate;
    expect(lo.assumedPercent).toBe(20);
    expect(lo.observedPercent).toBe(25);
    expect(lo.updatedPercent).toBe(22.5);
    const hi = outcomeFor(run(0), "keep_full", SIMULATED_OUTCOMES.higher_15).learned.codReturnRate;
    expect(hi.observedPercent).toBe(18);
    expect(hi.updatedPercent).toBe(19);
  });
});

describe("computeOutcome is a pure function", () => {
  it("gives the same answer twice and does not change its inputs", () => {
    const r = run(25);
    const before = JSON.stringify(r);
    const a = outcomeFor(r, "right_sized", SIMULATED_OUTCOMES.lower_15, 25);
    const b = outcomeFor(r, "right_sized", SIMULATED_OUTCOMES.lower_15, 25);
    expect(a).toEqual(b);
    expect(JSON.stringify(r)).toBe(before);
  });
});
