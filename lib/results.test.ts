import { describe, expect, it } from "vitest";
import { merchant } from "./data/merchant";
import { sampleInvoice } from "./data/invoice";
import { runEngine } from "./engine";
import { computeOutcome, OUTCOME_IDS, SIMULATED_OUTCOMES } from "./engine/outcome";
import { formatINR, formatSignedINR } from "./format";
import { DEFAULT_JOURNEY } from "./journey";
import { SAVING_BASIS, nextTimeBullets, outcomeForState, resultTiles, savedCard } from "./results";

const run = (drop = 0) => runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: drop });
const state = (drop = 0, chosenView: "keep_full" | "right_sized" | null = "keep_full") => ({ ...DEFAULT_JOURNEY, salesDropPercent: drop, chosenView });
const at = (id: (typeof OUTCOME_IDS)[number], drop = 0) => outcomeForState(run(drop), state(drop), id)!;
const words = (s: string) => s.trim().split(/\s+/).length;
const FORBIDDEN = /\(|\)|because|n\/a|—|Note:|[A-Za-z]:\s/i;

describe("outcomeForState", () => {
  it("is null until a plan is chosen", () => {
    expect(outcomeForState(run(), state(0, null), "as_forecast")).toBeNull();
  });
  it("uses the plan the founder approved, not the one the numbers favour", () => {
    const r = run(30);
    expect(r.recommendedView).toBe("right_sized");
    const keep = outcomeForState(r, state(30, "keep_full"), "as_forecast")!;
    const cut = outcomeForState(r, state(30, "right_sized"), "as_forecast")!;
    expect(keep.stock.ordered).toBe(sampleInvoice.units);
    expect(cut.stock.ordered).toBeLessThan(keep.stock.ordered);
  });
  it("gives exactly what computeOutcome gives for the same inputs", () => {
    const r = run(10);
    const direct = computeOutcome({ approved: r.views.keepFull, fullOrder: r.views.keepFull, stock: r.stock, merchant, salesDropPercent: 10, cashElsewhere: 0, actual: SIMULATED_OUTCOMES.lower_15 });
    expect(outcomeForState(r, state(10), "lower_15")).toEqual(direct);
  });
});

describe("the 'You saved' card", () => {
  it("has the label, the number and the caption as written: ₹11,310 = ₹10,000 discount + ₹1,310 lower interest", () => {
    expect(savedCard(at("as_forecast"))).toEqual({
      label: "You saved",
      value: "₹11,310",
      caption: "₹10,000 discount + ₹1,310 lower interest",
      tone: "saved",
    });
  });
  it("the number is the headline saving, and the two parts in the caption add up to it", () => {
    for (const id of OUTCOME_IDS) {
      const o = at(id);
      expect(o.cost.fromCheaperFunding + o.cost.plan.discountCaptured).toBe(o.cost.moneySaved);
      expect(savedCard(o).value).toBe(formatINR(o.cost.moneySaved));
    }
  });
  it("leaves out the discount when the plan took none", () => {
    const r = runEngine({ merchant, invoice: { ...sampleInvoice, earlyPayDiscountPct: 0 } });
    expect(savedCard(outcomeForState(r, state(0), "as_forecast")!).caption).toMatch(/^₹[\d,]+ lower interest$/);
  });
  it("never shows a negative amount: it says 'You paid extra' and the amount", () => {
    const o = at("as_forecast");
    const worse = { ...o, cost: { ...o.cost, moneySaved: -450, fromCheaperFunding: -450, plan: { ...o.cost.plan, discountCaptured: 0 } } };
    expect(savedCard(worse)).toMatchObject({ label: "You paid extra", value: "₹450", caption: "₹450 higher interest", tone: "extra" });
  });
  it("follows the copy rules at every season and slider value", () => {
    for (const id of OUTCOME_IDS) {
      for (const drop of [0, 10, 25, 30]) {
        const c = savedCard(at(id, drop));
        for (const t of [c.label, c.value, c.caption]) {
          expect(t, `${id} -${drop}%`).not.toMatch(FORBIDDEN);
          expect(t).not.toMatch(/[−-]₹|₹-/);
        }
        expect(words(c.caption)).toBeLessThanOrEqual(8);
      }
    }
  });
  it("the basis is stated once, for anything that needs it", () => {
    expect(SAVING_BASIS).toContain("Razorpay credit line, then your bank's overdraft, paid on the due date");
  });
});

describe("the three small cards", () => {
  it("Borrowed, Pairs sold and Forecast, as written for 'as forecast'", () => {
    expect(resultTiles(at("as_forecast"))).toEqual([
      { label: "Borrowed", value: "₹1,17,164", caption: "All of it needed" },
      { label: "Pairs sold", value: "500 of 500", caption: "" },
      { label: "Forecast", value: "On target", caption: "" },
    ]);
  });
  it("never warns about a sell-out when sales were as forecast", () => {
    for (const t of resultTiles(at("as_forecast"))) expect(`${t.value} ${t.caption}`).not.toMatch(/sold out|sell/i);
  });
  it("says so when sales were lower: the plan needed more, and pairs are left over", () => {
    const [borrowed, sold, forecast] = resultTiles(at("lower_15"));
    expect(borrowed.caption).toMatch(/^₹[\d,]+ more needed$/);
    expect(sold.caption).toBe("58 left over");
    expect(forecast.value).toBe("15% below");
  });
  it("says so when sales were higher: part of the borrowing was not needed", () => {
    const [borrowed, , forecast] = resultTiles(at("higher_15"));
    expect(borrowed.caption).toMatch(/^₹[\d,]+ not needed$/);
    expect(forecast.value).toBe("15% above");
  });
  it("captions are at most eight words and break none of the copy rules", () => {
    for (const id of OUTCOME_IDS) for (const drop of [0, 25]) for (const t of resultTiles(at(id, drop))) {
      expect(words(t.label)).toBeLessThanOrEqual(4);
      if (t.caption) expect(words(t.caption), t.caption).toBeLessThanOrEqual(8);
      expect(`${t.label} ${t.value} ${t.caption}`).not.toMatch(FORBIDDEN);
    }
  });
});

describe("Next time", () => {
  it("has two bullets of at most ten words each, for every season and slider value", () => {
    for (const id of OUTCOME_IDS) {
      for (const drop of [0, 10, 25, 30]) {
        const bullets = nextTimeBullets(at(id, drop), drop);
        expect(bullets).toHaveLength(2);
        for (const b of bullets) {
          expect(words(b), `${id} -${drop}%: ${b}`).toBeLessThanOrEqual(10);
          expect(b).not.toMatch(FORBIDDEN);
        }
      }
    }
  });
  it("says what to change: 15% under forecast, start at 1.3x", () => {
    expect(nextTimeBullets(at("lower_15"), 0)[0]).toBe("Sales ran 15% under forecast. Next time, start at 1.3x.");
    expect(nextTimeBullets(at("higher_15"), 0)[0]).toContain("15% over forecast");
  });
  it("keeps the estimate when sales matched", () => {
    expect(nextTimeBullets(at("as_forecast"), 0)[0]).toBe("Sales matched forecast. Keep starting at 1.4x.");
  });
  it("after a what-if, compares with normal, not the lowered forecast", () => {
    expect(nextTimeBullets(at("as_forecast", 25), 25)[0]).toBe("Sales ran 25% under normal. Next time, start at 1.22x.");
  });
  it("says what the COD return rate was against the one assumed, and what to expect", () => {
    expect(nextTimeBullets(at("lower_15"), 0)[1]).toBe("COD returns were 25%, not 20%. Next time, expect 22.5%.");
    expect(nextTimeBullets(at("higher_15"), 0)[1]).toBe("COD returns were 18%, not 20%. Next time, expect 19%.");
    expect(nextTimeBullets(at("as_forecast"), 0)[1]).toBe("COD returns matched the 20% assumed.");
  });
});

describe("signed rupees", () => {
  it("puts the minus in front of the sign", () => {
    expect(formatSignedINR(-7942)).toBe("−₹7,942");
    expect(formatSignedINR(0)).toBe("₹0");
  });
});
