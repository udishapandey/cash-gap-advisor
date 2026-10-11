import { describe, expect, it } from "vitest";
import { merchant } from "./data/merchant";
import { sampleInvoice } from "./data/invoice";
import { runEngine, type ViewId } from "./engine";
import { SIMULATED_OUTCOMES } from "./engine/outcome";
import { formatCompactINR, formatDayMonth, formatINR } from "./format";
import { DEFAULT_JOURNEY, tenureDays } from "./journey";
import {
  FEWER_PAIRS_NO_HELP,
  OPTION_LABEL,
  OPTION_SHORT,
  TERMS,
  buildHeroPlan,
  compareRows,
  daysFootnote,
  fewerPairsSameAsFull,
  forecastSaving,
} from "./plain";
import { heroBasis, outcomeForState } from "./results";

const run = (drop = 0, extra = {}) => runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: drop, ...extra });
const state = (drop = 0, cashElsewhere = 0) => ({ salesDropPercent: drop, cashElsewhere });
const DROPS = [0, 5, 10, 15, 20, 25, 30];
const words = (s: string) => s.trim().split(/\s+/).length;
const OLD_JARGON = /early settlement|bank overdraft|(?<!Razorpay )credit line|peak shortfall|funding cost|right-size|standby|annualised/i;

describe("compact rupees for headlines", () => {
  it("lakh, thousand and crore", () => {
    expect(formatCompactINR(227_621)).toBe("₹2.28L");
    expect(formatCompactINR(51_637)).toBe("₹52K");
    expect(formatCompactINR(403_605)).toBe("₹4.04L");
    expect(formatCompactINR(100_000)).toBe("₹1L");
    expect(formatCompactINR(99_600)).toBe("₹1L"); // not "₹100K"
    expect(formatCompactINR(500)).toBe("₹500");
    expect(formatCompactINR(12_500_000)).toBe("₹1.25Cr");
    expect(formatCompactINR(0)).toBe("₹0");
    expect(formatCompactINR(1_049_540)).toBe("₹10.5L");
  });
  it("a date a number of days away", () => {
    expect(formatDayMonth("2026-10-10", 10)).toBe("20 Oct");
    expect(formatDayMonth("2026-12-28", 5)).toBe("2 Jan");
    expect(formatDayMonth("2026-02-27", 2)).toBe("1 Mar");
  });
});

describe("plain labels", () => {
  it("renames each funding source as agreed", () => {
    expect(OPTION_LABEL.early_settlement).toBe("Get your Razorpay sales money early");
    expect(OPTION_LABEL.bank_overdraft).toBe("Your bank's overdraft");
    expect(OPTION_LABEL.credit_line).toBe("Razorpay credit line");
    expect(TERMS.peakShortfall).toBe("Most you'll be short on any day");
    expect(TERMS.fundingCost).toBe("Total interest and fees");
    expect(TERMS.orderFewer).toBe("Order fewer pairs");
    expect(TERMS.standby).toBe("Backup if sales are slow");
    expect(TERMS.yearlyRate).toBe("Yearly rate (for comparison only)");
  });
  it("uses none of the old finance words", () => {
    for (const t of [...Object.values(OPTION_LABEL), ...Object.values(OPTION_SHORT), ...Object.values(TERMS)]) expect(t).not.toMatch(OLD_JARGON);
  });
  it("leaves the engine's own names alone: only the screen words change", () => {
    const names = run().views.keepFull.options.map((o) => o.name);
    expect(names).toContain("Early settlement");
    expect(names).toContain("Credit line");
  });
});

describe("the one headline saving", () => {
  it("is the same number the Results screen shows for 'sales as forecast', for every plan and slider value", () => {
    for (const drop of DROPS) {
      const r = run(drop);
      for (const view of ["keep_full", "right_sized"] as ViewId[]) {
        const results = outcomeForState(r, { chosenView: view, ...state(drop) }, "as_forecast")!.cost.moneySaved;
        expect(forecastSaving(r, view, state(drop)), `${view} -${drop}%`).toBe(results);
      }
    }
  });
  it("is not thrown off by a real journey state, whose own chosenView is null until the founder chooses (a bug the screen showed)", () => {
    const r = run(0);
    const journey = { ...DEFAULT_JOURNEY, invoice: sampleInvoice, chosenView: null };
    expect(forecastSaving(r, "keep_full", journey)).toBe(11_310);
    expect(forecastSaving(r, "keep_full", { ...journey, chosenView: "right_sized" })).toBe(11_310); // the plan asked for wins
    expect(buildHeroPlan(r, r.recommendedView, forecastSaving(r, r.recommendedView, journey)).payLine).toContain("you're ₹11,310 better off");
  });

  it("the demo's is ₹11,310, against the usual way: credit line, then the overdraft, paid on the due date", () => {
    const r = run(0);
    expect(forecastSaving(r, "keep_full", state())).toBe(11_310);
    expect(heroBasis(outcomeForState(r, { chosenView: "keep_full", ...state() }, "as_forecast")!)).toContain(
      "Razorpay credit line, then your bank's overdraft, paid on the due date",
    );
  });
});

describe("the recommended plan, as the founder reads it", () => {
  const r = run(0);
  const hero = buildHeroPlan(r, r.recommendedView, forecastSaving(r, r.recommendedView, state()));

  it("says how short he is, in one short sentence", () => {
    expect(hero.shortLine).toBe("You're short about ₹2.28L for a few days.");
    expect(hero.shortLine).toBe(`You're short about ${formatCompactINR(r.recommended.gap.gapExpected)} for a few days.`);
  });
  it("explains why the amount to cover is bigger than the shortfall, when paying early for the discount", () => {
    expect(hero.coverNote).toBe("Paying on day 7 for the discount means needing ₹2.88L at the worst point, 3 days sooner.");
    expect(hero.total).toBe(r.recommended.recommended.plan.covered);
    const noDiscount = run(0, { invoice: { ...sampleInvoice, earlyPayDiscountPct: 0 } });
    expect(buildHeroPlan(noDiscount, "keep_full", 0).coverNote).toBeNull();
  });
  it("lists the sources in the plan's order, with amounts that add up and shares that fill the bar", () => {
    expect(hero.coverIntro).toBe("Don't take one big loan. Cover it in this order:");
    expect(hero.steps.map((s) => s.label)).toEqual(["Razorpay sales money, early", "Your bank's overdraft", "Razorpay credit line"]);
    expect(hero.steps.map((s) => s.amount)).toEqual([170_987, 100_000, 17_164]);
    expect(hero.steps.reduce((t, s) => t + s.amount, 0)).toBe(hero.total);
    expect(hero.steps.reduce((t, s) => t + s.share, 0)).toBeCloseTo(1, 9);
  });
  it("gives the key insight with the real rupees, only when the early money is the cheapest", () => {
    expect(hero.insight).toBe(
      "Getting your sales money 2 days early looks expensive per year, but costs only ₹513: you need it for just 2 days. Compare rupees, not yearly rates.",
    );
    const dear = run(0, { overdraftRatePct: 3 }); // a 3% overdraft costs less than the 0.30% fee for these days
    const h = buildHeroPlan(dear, dear.recommendedView, 0);
    if (h.steps.some((s) => s.id === "early_settlement")) expect(h.insight).toBeNull();
  });
  it("says what paying early earns and the single headline saving", () => {
    expect(hero.payLine).toBe("Pay the supplier by day 7 → you get ₹10,000 off. After all interest and fees, you're ₹11,310 better off.");
    expect(hero.saving).toBe(11_310);
  });
  it("is plain: no old finance words, no negative rupees, and no sentence over about 20 words", () => {
    for (const drop of DROPS) {
      const rr = run(drop);
      const h = buildHeroPlan(rr, rr.recommendedView, forecastSaving(rr, rr.recommendedView, state(drop)));
      const sentences = [h.shortLine, h.coverNote, h.coverIntro, h.insight, h.payLine, h.basis, h.fewerPairsNote, ...h.steps.map((s) => s.label)]
        .filter((x): x is string => !!x)
        .flatMap((x) => x.split(/(?<=[.!?])\s+/));
      for (const sen of sentences) {
        expect(sen, `-${drop}%`).not.toMatch(OLD_JARGON);
        expect(sen, `-${drop}%`).not.toMatch(/[−-]₹|₹-/);
        expect(words(sen), `${sen} (-${drop}%)`).toBeLessThanOrEqual(24);
      }
      // The body text of the headline card stays short: about 40 words outside the funding list.
      const body = [h.shortLine, h.coverNote ?? "", h.insight ?? "", h.payLine].join(" ");
      expect(words(body), `-${drop}%`).toBeLessThanOrEqual(75);
    }
  });
  it("with no borrowing, says so instead of listing sources", () => {
    const rich = run(0, { cashElsewhere: 5_000_000 });
    const h = buildHeroPlan(rich, "keep_full", 0);
    expect(h.steps).toEqual([]);
    expect(h.coverIntro).toContain("don't need to borrow");
  });
  it("on the due date, says interest and fees compared with the usual way, never 'better off' when it isn't", () => {
    const noDiscount = run(0, { invoice: { ...sampleInvoice, earlyPayDiscountPct: 0 } });
    expect(buildHeroPlan(noDiscount, "keep_full", 500).payLine).toContain("₹500 less than the usual way");
    expect(buildHeroPlan(noDiscount, "keep_full", -500).payLine).toContain("₹500 more than the usual way");
    expect(buildHeroPlan(noDiscount, "keep_full", 0).payLine).toContain("match the usual way");
    expect(buildHeroPlan(noDiscount, "keep_full", 500).payLine).not.toContain("better off");
  });
});

describe("ordering fewer pairs, when it is the same as the full order", () => {
  it("is the same plan at 0% and 10% sales, and different once the forecast says some pairs won't sell", () => {
    expect(fewerPairsSameAsFull(run(0))).toBe(true);
    expect(fewerPairsSameAsFull(run(20))).toBe(false);
    expect(fewerPairsSameAsFull(run(30))).toBe(false);
  });
  it("says why in one line, with the real pair count", () => {
    expect(FEWER_PAIRS_NO_HELP(500)).toBe("Ordering fewer pairs wouldn't help: the forecast says all 500 sell.");
    const r = run(0);
    expect(buildHeroPlan(r, "keep_full", 0).fewerPairsNote).toBe(FEWER_PAIRS_NO_HELP(r.stock.fullUnits));
    expect(buildHeroPlan(run(20), "right_sized", 0).fewerPairsNote).toBeNull();
  });
  it("hides its row in the compare table when it is the same, and shows it when it is not", () => {
    expect(compareRows(run(0), "keep_full").map((x) => x.id)).not.toContain("order_fewer");
    expect(compareRows(run(25), "right_sized").map((x) => x.id)).toContain("order_fewer");
  });
});

describe("the compare table", () => {
  const r = run(0);
  const rows = compareRows(r, "keep_full");

  it("has one row per way of finding the money, in plain words", () => {
    expect(rows.map((x) => x.label)).toEqual([
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      "Pay early for the discount",
    ]);
    for (const x of rows) expect(x.label).not.toMatch(OLD_JARGON);
    const labels = rows.map((x) => x.label);
    expect(labels).toContain("Get your Razorpay sales money early");
    expect(labels).toContain("Your bank's overdraft");
    expect(labels).toContain("Razorpay credit line");
  });

  it("uses ONE day count for the same money: loans are out for the plan's 33 days, not 30 in one place and 33 in another", () => {
    const view = r.views.keepFull;
    expect(tenureDays(view)).toBe(33);
    const loans = rows.filter((x) => x.id === "credit_line" || x.id === "bank_overdraft");
    expect(loans.map((x) => x.days)).toEqual(["33", "33"]);
    expect(rows.find((x) => x.id === "early_settlement")!.days).toBe("2");
    expect(rows.some((x) => x.days === "30")).toBe(false);
  });

  it("prices the overdraft on its own limit at the plan's days: ₹1,266, the same figure as in the plan", () => {
    const od = rows.find((x) => x.id === "bank_overdraft")!;
    const step = r.views.keepFull.recommended.plan.steps.find((s) => s.optionId === "bank_overdraft")!;
    expect(od.covers).toBe(formatINR(100_000));
    expect(od.cost).toBe(formatINR(step.cost));
    expect(od.cost).toBe("₹1,266");
    expect(od.yearly).toBe("14%");
  });

  it("prices early money at ₹513 for the plan's ₹1,70,987, and shows its 54.75% yearly rate for comparison only", () => {
    const e = rows.find((x) => x.id === "early_settlement")!;
    expect(e.covers).toBe("₹1,70,987");
    expect(e.cost).toBe("₹513");
    expect(e.yearly).toBe("54.75%");
  });

  it("every day count in the table matches the plan, at every slider value and for both plans", () => {
    for (const drop of DROPS) {
      const rr = run(drop);
      for (const [id, view] of [["keep_full", rr.views.keepFull], ["right_sized", rr.views.rightSized]] as const) {
        const loanDays = String(tenureDays(view));
        for (const x of compareRows(rr, id)) {
          if (x.id === "credit_line" || x.id === "bank_overdraft") expect(x.days, `${id} -${drop}% ${x.id}`).toBe(loanDays);
        }
      }
    }
  });

  it("explains the days once, in the footnote", () => {
    const note = daysFootnote(r.views.keepFull);
    expect(note).toContain("out for 2 days");
    expect(note).toContain("A loan is out for 33 days");
    expect(note).toContain("30, plus 3 because paying early needs the cash sooner");
    const onDue = daysFootnote(run(0, { invoice: { ...sampleInvoice, earlyPayDiscountPct: 0 } }).views.keepFull);
    expect(onDue).toContain("A loan is out for 30 days");
    expect(onDue).not.toContain("plus");
  });

  it("the discount row says what it saves and the extra interest, without a minus sign", () => {
    const d = rows.find((x) => x.id === "pay_early")!;
    expect(d.covers).toBe("₹10,000 off");
    expect(d.cost).toBe("₹893 more in interest");
    expect(d.days).toBe("3 days early");
    for (const drop of DROPS) for (const x of compareRows(run(drop), "keep_full")) expect(`${x.covers} ${x.cost}`).not.toMatch(/[−-]₹|₹-/);
  });
});

describe("the same saving on both screens", () => {
  it("Options says ₹11,310 and Results at 'sales as forecast' says the same", () => {
    const r = run(0);
    const hero = buildHeroPlan(r, r.recommendedView, forecastSaving(r, r.recommendedView, state()));
    const resultsSaving = outcomeForState(r, { chosenView: r.recommendedView, ...state() }, "as_forecast")!.cost.moneySaved;
    expect(hero.payLine).toContain(formatINR(resultsSaving));
    expect(SIMULATED_OUTCOMES.as_forecast.salesVsForecast).toBe(1);
  });
});
