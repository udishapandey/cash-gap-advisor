import { describe, expect, it } from "vitest";
import { merchant } from "./data/merchant";
import { defaultInvoice as sampleInvoice } from "./data/default-scenario";
import { runEngine } from "./engine";
import { computeOutcome, OUTCOME_IDS, SIMULATED_OUTCOMES } from "./engine/outcome";
import { formatINR, formatSignedINR } from "./format";
import { DEFAULT_JOURNEY } from "./journey";
import { dayLabel } from "./plain";
import { MID_SEASON_CAPTION, NEXT_TIME_CAPTION, SAVING_BASIS, gapRow, midSeasonForState, midSeasonView, nextTimeBullets, outcomeForState, savedBreakdown, savedHeadline } from "./results";

const run = (drop = 0) => runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: drop });
const state = (drop = 0, chosenView: "keep_full" | "right_sized" | null = "keep_full") => ({ ...DEFAULT_JOURNEY, salesDropPercent: drop, chosenView });
const at = (id: (typeof OUTCOME_IDS)[number], drop = 0) => outcomeForState(run(drop), state(drop), id)!;
const words = (s: string) => s.trim().split(/\s+/).length;
const FORBIDDEN = /\(|\)|because|n\/a|—|Note:/i;

describe("outcomeForState", () => {
  it("is null until a plan is chosen", () => {
    expect(outcomeForState(run(), state(0, null), "as_forecast")).toBeNull();
  });
  it("uses the plan the founder approved", () => {
    const r = run(0);
    const keep = outcomeForState(r, state(0, "keep_full"), "as_forecast")!;
    expect(keep.stock.ordered).toBe(sampleInvoice.units);
  });
  it("gives exactly what computeOutcome gives for the same inputs", () => {
    const r = run(10);
    const direct = computeOutcome({ approved: r.views.keepFull, fullOrder: r.views.keepFull, stock: r.stock, merchant, salesDropPercent: 10, cashElsewhere: 0, actual: SIMULATED_OUTCOMES.lower_15 });
    expect(outcomeForState(r, state(10), "lower_15")).toEqual(direct);
  });
});

describe("the saved headline and breakdown", () => {
  it("has the headline as written: This plan saved you ₹9,583", () => {
    expect(savedHeadline(at("as_forecast"))).toBe("This plan saved you ₹9,583");
  });
  it("the breakdown is the discount, the plan's interest and fees, and the usual way's cost", () => {
    expect(savedBreakdown(at("as_forecast"))).toEqual([
      { label: "Discount", value: "₹10,000" },
      { label: "Interest and fees", value: "₹417" },
      { label: "Paying on the due date", value: "₹0" },
    ]);
  });
  it("the headline is the discount less the plan's cost, set against the usual way's cost, in every season", () => {
    for (const id of OUTCOME_IDS) {
      const o = at(id);
      expect(o.cost.moneySaved).toBe(o.cost.plan.discountCaptured - o.cost.plan.fundsCost + o.cost.default.fundsCost);
      expect(savedHeadline(o)).toBe(`This plan saved you ${formatINR(o.cost.moneySaved)}`);
    }
  });
  it("never shows a negative amount: it says what the plan cost extra", () => {
    const o = at("as_forecast");
    const worse = { ...o, cost: { ...o.cost, moneySaved: -450 } };
    expect(savedHeadline(worse)).toBe("This plan cost you ₹450 more");
    expect(savedHeadline({ ...o, cost: { ...o.cost, moneySaved: 0 } })).toBe("This plan cost the same as the usual way");
  });
  it("follows the copy rules at every season and slider value", () => {
    for (const id of OUTCOME_IDS) {
      for (const drop of [0, 10, 25, 30]) {
        const o = at(id, drop);
        for (const t of [savedHeadline(o), ...savedBreakdown(o).flatMap((r) => [r.label, r.value])]) {
          expect(t, `${id} -${drop}%`).not.toMatch(FORBIDDEN);
          expect(t).not.toMatch(/[−-]₹|₹-/);
        }
      }
    }
  });
  it("the basis is stated once, for anything that needs it", () => {
    expect(SAVING_BASIS).toContain("paying on the due date");
  });
});

describe("forecast gap against actual gap", () => {
  it("as forecast, there is no difference", () => {
    expect(gapRow(at("as_forecast"))).toEqual({ forecast: "₹2,30,900", actual: "₹2,30,900", difference: "None" });
  });
  it("says more or less in words, never with a minus", () => {
    expect(gapRow(at("lower_15"))).toEqual({ forecast: "₹2,30,900", actual: "₹3,47,830", difference: "₹1,16,930 more" });
    expect(gapRow(at("higher_15")).difference).toMatch(/^₹[\d,]+ less$/);
  });
});

describe("the mid-season check", () => {
  const date = (d: number) => dayLabel(sampleInvoice, d);
  const mid = midSeasonForState(run(), state())!;
  const view = midSeasonView(mid, date);
  it("is null until a plan is chosen", () => {
    expect(midSeasonForState(run(), state(0, null))).toBeNull();
  });
  it("has the headline as written, on day 5 before the payment", () => {
    expect(view.headline).toBe("Day 5 check: sales are 15% below forecast.");
    expect(date(5)).toBe("16 Oct");
  });
  it("shows the forecast against actual cash in, and the updated gap for paying on 21 Oct", () => {
    expect(view.rows.map((r) => r.label)).toEqual(["Cash in so far, forecast", "Cash in so far, actual", "Likely gap for 21 Oct, forecast", "Likely gap for 21 Oct, updated"]);
    expect(view.rows[2].value).toBe("₹2,30,900");
    expect(view.rows[3].value).toBe("₹3,47,830");
  });
  it("shows the updated cost and saving of both ways to pay, and says plainly what to do", () => {
    expect(view.plans).toEqual([
      { label: "Pay on 21 Oct", cost: "₹2,253", saving: "₹8,119" },
      { label: "Pay on 10 Nov", cost: "₹237", saving: "-" },
    ]);
    expect(view.verdict).toBe("Paying early is no longer worth it. Pay on 10 Nov instead.");
    expect(view.verdictWhy).toBe("It still saves money, but if sales fall further you could run out of credit.");
  });
  it("says exactly what changes", () => {
    expect(view.changes).toEqual(["Pay on 10 Nov instead of 21 Oct"]);
    expect(view.nothingChanges).toBeNull();
  });
  it("has the captions as written", () => {
    expect(MID_SEASON_CAPTION).toBe("The plan updates as real sales arrive. Sales are simulated in this prototype.");
    expect(NEXT_TIME_CAPTION).toBe("Prototype uses a simple update rule. Production would learn from your history.");
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
    expect(nextTimeBullets(at("lower_15"), 0)[1]).toBe("COD returns were 35%, not 30%. Next time, expect 32.5%.");
    expect(nextTimeBullets(at("higher_15"), 0)[1]).toBe("COD returns were 27%, not 30%. Next time, expect 28.5%.");
    expect(nextTimeBullets(at("as_forecast"), 0)[1]).toBe("COD returns matched the 30% assumed.");
  });
});

describe("signed rupees", () => {
  it("puts the minus in front of the sign", () => {
    expect(formatSignedINR(-7942)).toBe("−₹7,942");
    expect(formatSignedINR(0)).toBe("₹0");
  });
});
