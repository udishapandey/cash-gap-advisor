import { describe, expect, it } from "vitest";
import { merchant } from "./data/merchant";
import { sampleInvoice } from "./data/invoice";
import { runEngine } from "./engine";
import { computeOutcome, OUTCOME_IDS, SIMULATED_OUTCOMES } from "./engine/outcome";
import { formatINR, formatSignedINR } from "./format";
import { DEFAULT_JOURNEY } from "./journey";
import {
  SAVING_BASIS,
  accuracyTile,
  borrowingNote,
  defaultCannotFund,
  heroBasis,
  heroHeadline,
  heroParts,
  learnedLines,
  outcomeForState,
  planCostLine,
  soldOutNote,
} from "./results";

const run = (drop = 0) => runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: drop });
const state = (drop = 0, chosenView: "keep_full" | "right_sized" | null = "keep_full") => ({ ...DEFAULT_JOURNEY, salesDropPercent: drop, chosenView });
const at = (id: (typeof OUTCOME_IDS)[number], drop = 0) => outcomeForState(run(drop), state(drop), id)!;

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
    expect(cut.stock.ordered).toBe(r.views.rightSized.units);
    expect(cut.stock.ordered).toBeLessThan(keep.stock.ordered);
  });
  it("gives exactly what computeOutcome gives for the same inputs", () => {
    const r = run(10);
    const direct = computeOutcome({ approved: r.views.keepFull, fullOrder: r.views.keepFull, stock: r.stock, merchant, salesDropPercent: 10, cashElsewhere: 0, actual: SIMULATED_OUTCOMES.lower_15 });
    expect(outcomeForState(r, state(10), "lower_15")).toEqual(direct);
  });
});

describe("the hero line", () => {
  it("is one short sentence: how much better off than the usual way", () => {
    const o = at("as_forecast");
    expect(o.cost.moneySaved).toBeGreaterThan(0);
    expect(heroHeadline(o)).toBe(`You're ${formatINR(o.cost.moneySaved)} better off than the usual way.`);
    expect(heroHeadline(o).split(" ").length).toBeLessThanOrEqual(20);
  });
  it("splits the total into less interest and fees plus the early-payment discount", () => {
    const o = at("as_forecast");
    expect(o.cost.plan.discountCaptured).toBeGreaterThan(0);
    expect(heroParts(o)).toBe(
      `${formatINR(o.cost.fromCheaperFunding)} less in interest and fees + ${formatINR(o.cost.plan.discountCaptured)} early-payment discount`,
    );
  });
  it("the two parts add up to the total", () => {
    for (const id of OUTCOME_IDS) {
      const o = at(id);
      expect(o.cost.fromCheaperFunding + o.cost.plan.discountCaptured).toBe(o.cost.moneySaved);
    }
  });
  it("leaves out the discount part when the plan took no discount", () => {
    const r = runEngine({ merchant, invoice: { ...sampleInvoice, earlyPayDiscountPct: 0 } });
    const o = outcomeForState(r, state(0), "as_forecast")!;
    expect(o.cost.plan.discountCaptured).toBe(0);
    expect(heroParts(o)).not.toContain("discount");
    expect(heroParts(o)).toContain("in interest and fees");
  });
  it("is honest when the plan was worse off, or about even", () => {
    const o = at("as_forecast");
    const worse = { ...o, cost: { ...o.cost, moneySaved: -450, fromCheaperFunding: -450, plan: { ...o.cost.plan, discountCaptured: 0 } } };
    expect(heroHeadline(worse)).toBe("You're ₹450 worse off than the usual way.");
    expect(heroParts(worse)).toBe("₹450 more in interest and fees");
    expect(heroHeadline({ ...o, cost: { ...o.cost, moneySaved: 0 } })).toBe("You're about even with the usual way.");
  });
  it("never shows a cost as a negative amount: the discount more than covers the interest", () => {
    const o = at("as_forecast");
    expect(o.cost.plan.netCost).toBeLessThan(0); // the discount (₹10,000) is bigger than the interest and fees (₹2,058)
    const line = planCostLine(o);
    expect(line).toBe(`The discount more than covers the interest by ${formatINR(o.cost.plan.discountCaptured - o.cost.plan.fundsCost)}.`);
    for (const id of OUTCOME_IDS) {
      for (const drop of [0, 10, 25, 30]) {
        const x = at(id, drop);
        for (const text of [heroHeadline(x), heroParts(x), planCostLine(x), heroBasis(x), accuracyTile(x).value, accuracyTile(x).note, borrowingNote(x)]) {
          expect(text, `${id} -${drop}%`).not.toMatch(/[−-]₹|₹-/);
        }
      }
    }
  });
  it("when the discount does not cover the interest, says what is left to pay", () => {
    const o = at("as_forecast");
    const tight = { ...o, cost: { ...o.cost, plan: { ...o.cost.plan, fundsCost: 12_000, discountCaptured: 10_000 } } };
    expect(planCostLine(tight)).toBe("Total interest and fees: ₹2,000 after the discount.");
  });
  it("says what it is compared with, and is candid when the usual way could not fund the whole gap", () => {
    expect(heroBasis(at("as_forecast"))).toBe(SAVING_BASIS);
    expect(SAVING_BASIS).toContain("Razorpay credit line, then your bank's overdraft, paid on the due date");
    const big = at("as_forecast", 25);
    expect(big.cost.default.coversWholeGap).toBe(false);
    expect(defaultCannotFund(big)).toBe(
      `Without a plan, the founder couldn't fund ${formatINR(big.cost.default.uncovered)} — they would have to pay late or cut the order.`,
    );
    expect(heroBasis(big)).toContain(defaultCannotFund(big));
    expect(heroBasis(at("as_forecast"))).not.toContain("couldn't fund");
  });
});

describe("the three tiles", () => {
  it("forecast accuracy: as forecast, below or above, and inside the range", () => {
    expect(accuracyTile(at("as_forecast"))).toEqual({ value: "Sales as forecast", note: "Inside the forecast range" });
    expect(accuracyTile(at("lower_15")).value).toBe("15% below forecast");
    expect(accuracyTile(at("higher_15")).value).toBe("15% above forecast");
  });
  it("borrowed more than needed: says so when the plan was short, drawn from the backup", () => {
    expect(borrowingNote(at("as_forecast"))).toBe("Every rupee borrowed was needed.");
    const short = at("lower_15");
    expect(short.borrowing.underFunded).toBeGreaterThan(0);
    expect(borrowingNote(short)).toBe(`Needed ${formatINR(short.borrowing.underFunded)} more, which your backup would cover.`);
    const high = at("higher_15");
    expect(high.borrowing.unnecessary).toBeGreaterThan(0);
    expect(borrowingNote(high)).toBe("More than the cash you really needed.");
    const beyond = { ...short, borrowing: { ...short.borrowing, beyondStandby: 5_000, drawnFromStandby: short.borrowing.underFunded - 5_000 } };
    expect(borrowingNote(beyond)).toContain("beyond it");
  });
  it("sold out: neutral when sales were as forecast, a heads-up when they beat it", () => {
    const as = soldOutNote(at("as_forecast"))!;
    expect(as).toEqual({ neutral: true, text: "All 500 sold; demand was about 20 pairs higher." });
    const higher = soldOutNote(at("higher_15"))!;
    expect(higher.neutral).toBe(false);
    expect(higher.text).toContain("customers wanted about");
    expect(soldOutNote(at("lower_15"))).toBeNull();
  });
});

describe("what I learned", () => {
  it("says it in the founder's words: 15% below forecast, so start from 1.3x instead of 1.4x", () => {
    const lines = learnedLines(at("lower_15"), 0);
    expect(lines[0]).toBe("Festive sales came in 15% below forecast. Next time I'll start from 1.3x instead of 1.4x.");
  });
  it("goes the other way when sales were higher", () => {
    const [line] = learnedLines(at("higher_15"), 0);
    expect(line).toContain("15% above forecast");
    expect(line).toContain("instead of 1.4x");
    expect(line).toMatch(/start from 1\.5x?1?/);
  });
  it("keeps the estimate when sales were as forecast", () => {
    expect(learnedLines(at("as_forecast"), 0)[0]).toBe("Festive sales came in as forecast, so I'll keep starting from 1.4x.");
  });
  it("when a what-if was applied, measures against the usual estimate, not the founder's own lower case", () => {
    const [line] = learnedLines(at("as_forecast", 25), 25);
    expect(line).toContain("25% below my usual 1.4x estimate");
  });
  it("compares the COD return rate with the assumed one", () => {
    expect(learnedLines(at("lower_15"), 0)[1]).toBe("COD returns were 25% against the 20% I assumed. Next time I'll assume 22.5%.");
    expect(learnedLines(at("higher_15"), 0)[1]).toBe("COD returns were 18% against the 20% I assumed. Next time I'll assume 19%.");
    expect(learnedLines(at("as_forecast"), 0)[1]).toBe("COD returns came in at 20%, the same as I assumed.");
  });
});

describe("signed rupees", () => {
  it("puts the minus in front of the sign", () => {
    expect(formatSignedINR(-7942)).toBe("−₹7,942");
    expect(formatSignedINR(1000)).toBe("₹1,000");
    expect(formatSignedINR(0)).toBe("₹0");
  });
});
