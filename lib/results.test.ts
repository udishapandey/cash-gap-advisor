import { describe, expect, it } from "vitest";
import { merchant } from "./data/merchant";
import { sampleInvoice } from "./data/invoice";
import { runEngine } from "./engine";
import { computeOutcome, OUTCOME_IDS, SIMULATED_OUTCOMES } from "./engine/outcome";
import { formatINR, formatSignedINR } from "./format";
import { DEFAULT_JOURNEY } from "./journey";
import { heroLine, learnedLines, outcomeForState } from "./results";

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
  it("says what the plan saved against drawing the full amount on the credit line", () => {
    const o = at("as_forecast");
    expect(o.cost.moneySaved).toBeGreaterThan(0);
    expect(heroLine(o)).toBe(`You saved ${formatINR(o.cost.moneySaved)} compared with drawing the full amount on your credit line.`);
  });
  it("is honest when the plan cost more, or the same", () => {
    const o = at("as_forecast");
    const worse = { ...o, cost: { ...o.cost, moneySaved: -450 } };
    const same = { ...o, cost: { ...o.cost, moneySaved: 0 } };
    expect(heroLine(worse)).toBe("The plan cost ₹450 more than drawing the full amount on your credit line.");
    expect(heroLine(same)).toBe("The plan cost the same as drawing the full amount on your credit line.");
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
