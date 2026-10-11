import { describe, expect, it } from "vitest";
import { merchant } from "../data/merchant";
import { sampleInvoice } from "../data/invoice";
import { CONFIG } from "./config";
import { runEngine } from "./index";
import { demandUnits, expectedLostMargin, marginPerPair, rightSize, withUnits } from "./stock";

describe("stock assumptions", () => {
  it("gross margin is 40% of a ₹1,700 selling price: ₹680 a pair", () => {
    expect(CONFIG.stock.sellingPricePerPair).toBe(1_700);
    expect(CONFIG.stock.grossMarginPct).toBe(40);
    expect(marginPerPair()).toBe(680);
  });

  it("the invoice is 500 pairs × ₹1,000 = ₹5,00,000", () => {
    expect(sampleInvoice.units).toBe(500);
    expect(sampleInvoice.unitPrice).toBe(1_000);
    expect(sampleInvoice.units * sampleInvoice.unitPrice).toBe(sampleInvoice.amount);
    expect(sampleInvoice.amount).toBe(500_000);
  });
});

describe("forecast pairs sold this season", () => {
  it("expected scenario repeats last Diwali's units", () => {
    expect(demandUnits(merchant, "expected")).toBe(CONFIG.stock.lastDiwaliUnitsSold);
  });
  it("scales with the scenario uplift: low < expected < high", () => {
    const [low, expected, high] = (["low", "expected", "high"] as const).map((s) => demandUnits(merchant, s));
    expect(low).toBeLessThan(expected);
    expect(expected).toBeLessThan(high);
    expect(low).toBeCloseTo((520 * 1.1) / 1.4, 6);
  });
  it("falls with the what-if sales drop", () => {
    expect(demandUnits(merchant, "expected", 30)).toBeCloseTo(364, 6);
  });
});

describe("expected lost margin = pairs not ordered × chance they sell × margin", () => {
  it("every deferred pair would sell when demand covers the whole order", () => {
    const r = expectedLostMargin({ orderUnits: 500, unitsNotOrdered: 150, demandUnits: 520 });
    expect(r.probabilitySell).toBe(1);
    expect(r.expectedLostMargin).toBe(150 * 680);
  });
  it("only the deferred pairs inside forecast demand count", () => {
    // demand 364: pairs 351-364 of the deferred 351-500 would sell = 14 pairs
    const r = expectedLostMargin({ orderUnits: 500, unitsNotOrdered: 150, demandUnits: 364 });
    expect(r.probabilitySell).toBeCloseTo(14 / 150, 10);
    expect(r.expectedLostMargin).toBe(14 * 680);
  });
  it("is zero when the pairs left off would not have sold", () => {
    expect(expectedLostMargin({ orderUnits: 500, unitsNotOrdered: 150, demandUnits: 300 }).expectedLostMargin).toBe(0);
  });
  it("is zero when nothing is left off", () => {
    expect(expectedLostMargin({ orderUnits: 500, unitsNotOrdered: 0, demandUnits: 520 }).expectedLostMargin).toBe(0);
  });
});

describe("split-order cost through the whole engine", () => {
  const splitCost = (drop: number) =>
    runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: drop }).views.keepFull.options.find(
      (o) => o.id === "split_order",
    )!.stockOut!.expectedLostMargin;

  it("is above zero at expected demand", () => {
    expect(splitCost(0)).toBeGreaterThan(0);
  });
  it("is lower at -30% sales", () => {
    expect(splitCost(30)).toBeLessThan(splitCost(0));
  });
  it("keeps falling as sales drop", () => {
    expect(splitCost(10)).toBeLessThanOrEqual(splitCost(0));
    expect(splitCost(20)).toBeLessThanOrEqual(splitCost(10));
    expect(splitCost(30)).toBeLessThanOrEqual(splitCost(20));
  });
});

describe("order right-sizing", () => {
  it("orders the pairs the forecast says will sell, never more than the invoice", () => {
    const r = rightSize(sampleInvoice, merchant, "expected", 0);
    expect(r.recommendedUnits).toBe(500); // demand 520, capped at the invoice
    expect(r.unitsCut).toBe(0);
  });
  it("cuts the order as sales drop and saves the cash", () => {
    const r = rightSize(sampleInvoice, merchant, "expected", 30);
    expect(r.recommendedUnits).toBe(364);
    expect(r.unitsCut).toBe(136);
    expect(r.cashSaved).toBe(136_000);
  });
  it("can be sized for any scenario", () => {
    const low = rightSize(sampleInvoice, merchant, "low", 0);
    expect(low.recommendedUnits).toBe(408);
    expect(low.demandByScenario.high).toBeGreaterThan(low.demandByScenario.expected);
  });
  it("recommends right-sizing only when unsold stock is over 10% of the order", () => {
    const flag = (drop: number) => rightSize(sampleInvoice, merchant, "expected", drop).recommend;
    expect(flag(0)).toBe(false);
    expect(flag(10)).toBe(false); // 6.4% unsold
    expect(flag(20)).toBe(true); // 16.8% unsold
    expect(flag(30)).toBe(true); // 27.2% unsold
  });
  it("withUnits keeps amount = units × unit price", () => {
    const inv = withUnits(sampleInvoice, 364);
    expect(inv.units).toBe(364);
    expect(inv.amount).toBe(364_000);
  });
});
