import { describe, expect, it } from "vitest";
import { defaultInvoice } from "./data/default-scenario";
import { merchant } from "./data/merchant";
import { runEngine, type ViewId } from "./engine";
import { formatCompactINR, formatDayMonth, formatINR } from "./format";
import { DEFAULT_JOURNEY } from "./journey";
import { readFileSync } from "node:fs";
import { UNCOVERED_TITLE, payEarlyReason, BILL_PRIVACY, LATE_FEE_LAW, OPTION_LABEL, SOURCE_ROW, backupLine, billHero, buildHeroPlan, compareRows, dayLabel, fewerPairsSameAsFull, forecastSaving, gapView, homeAlert, tidyName, aboutHowLong, dayByDay } from "./plain";
import { outcomeForState } from "./results";

const run = (drop = 0, extra = {}) => runEngine({ merchant, invoice: defaultInvoice, salesDropPercent: drop, ...extra });
const runDefault = (drop = 0, extra = {}) => runEngine({ merchant, invoice: defaultInvoice, salesDropPercent: drop, ...extra });
const state = (drop = 0, cashElsewhere = 0) => ({ salesDropPercent: drop, cashElsewhere });
const DROPS = [0, 5, 10, 15, 20, 25, 30];
const words = (s: string) => s.trim().split(/\s+/).length;
/** Anything the copy rules forbid on a default view. */
const FORBIDDEN = /\(|\)|because|n\/a|—|Note:/i;

describe("compact rupees and dates", () => {
  it("lakh, thousand and crore", () => {
    expect(formatCompactINR(227_621)).toBe("₹2.28L");
    expect(formatCompactINR(51_637)).toBe("₹52K");
    expect(formatCompactINR(99_600)).toBe("₹1L");
    expect(formatCompactINR(12_500_000)).toBe("₹1.25Cr");
  });
  it("a date a number of days away", () => {
    expect(formatDayMonth("2026-10-11", 10)).toBe("21 Oct");
    expect(formatDayMonth("2026-10-11", 30)).toBe("10 Nov");
    expect(formatDayMonth("2026-12-28", 5)).toBe("2 Jan");
  });
});

describe("the default scenario is the pre-read sample bill", () => {
  it("is Shree Ganesh Footwear, ₹5,00,000, 2/10 net 30, and its dates are real", () => {
    expect(defaultInvoice.supplier).toBe("Shree Ganesh Footwear Pvt Ltd");
    expect(defaultInvoice.amount).toBe(500_000);
    expect(defaultInvoice.dueInDays).toBe(30);
    expect(defaultInvoice.startDate).toBe("2026-10-11");
    expect(dayLabel(defaultInvoice, defaultInvoice.dueInDays)).toBe("10 Nov");
    expect(dayLabel(defaultInvoice, defaultInvoice.earlyPayWithinDays)).toBe("21 Oct");
  });
  it("tidyName drops the company form", () => {
    expect(tidyName(defaultInvoice.supplier)).toBe("Shree Ganesh Footwear");
    expect(tidyName("Mehta Leather Works LLP")).toBe("Mehta Leather Works");
    expect(tidyName("Acme")).toBe("Acme");
    expect(tidyName("Ltd")).toBe("Ltd");
  });
  it("gives the Cash gap numbers: cash in ₹12,09,100, cash out ₹13,90,000, likely short ₹2,30,900", () => {
    const v = gapView(runDefault());
    expect(v.headline).toBe("Cash shortfall: ₹2.31L for 8 days");
    expect(v.hero).toBe("₹2.31L");
    expect(v.duration).toBe("for 8 days");
    expect(v.dueLine).toBe("Paying on 10 Nov needs no borrowing.");
    expect(v.caption).toBe("Range ₹96,500 to ₹3,65,300");
    expect(v.summary.map((c) => c.label)).toEqual(["Cash available", "Cash going out", "Discount deadline"]);
    expect(v.summary.map((c) => c.value)).toEqual(["₹12.09L", "₹13.90L", "21 Oct"]);
    expect(v.summary[2].caption).toBe("Bill due 10 Nov");
  });
  it("says the shortfall includes the safety buffer", () => {
    expect(gapView(runDefault()).bufferLine).toBe("Includes ₹50,000 safety buffer");
  });
  it("labels the forecast with its confidence, and every estimate with a data source", () => {
    const v = gapView(runDefault());
    expect(v.forecastLabel).toBe("Forecast");
    expect(v.confidence).toBe("Low confidence");
    expect(v.estimates.map((e) => e.label)).toEqual(["Festive uplift", "COD share", "COD timing", "Returns", "Settlement timing"]);
    for (const e of v.estimates) expect(["Connected banking", "Store and courier data", "Entered by you"]).toContain(e.source);
    expect(v.estimates.find((e) => e.label === "COD share")?.value).toBe("45%");
    expect(v.estimates.find((e) => e.label === "Returns")?.value).toBe("30% of COD orders");
  });
  it("without a start date, dates count from the demo's today", () => {
    expect(dayLabel({ ...defaultInvoice, startDate: undefined }, 10)).toBe("20 Oct");
  });
});

describe("Home alert", () => {
  const r = runDefault();
  const a = homeAlert(r, forecastSaving(r, r.recommendedView, state()));
  it("has the title, the line and the mini plan as written", () => {
    expect(a.title).toBe("Save ₹10,000");
    expect(a.line).toBe("Pay Shree Ganesh Footwear by 21 Oct");
    expect(a.facts).toEqual([
      { label: "Bill", value: "₹5.00L", caption: "Due 10 Nov" },
      { label: "Cash needed", value: "₹2.31L", caption: "for 8 days" },
      { label: "Financing cost", value: "₹417" },
    ]);
    expect(a.mini).toEqual([
      { label: "Cash", value: 259_100 },
      { label: "Overdraft", value: 100_000 },
      { label: "Razorpay credit", value: 130_900 },
    ]);
    expect(a.caption).toBe("₹9,583");
  });
});

describe("when paying early is not recommended", () => {
  it("Home and Cash gap say what is short on the due date, never 'to pay early'", () => {
    const r = runDefault(20);
    expect(r.recommended.recommended.timing).toBe("on_due_date");
    expect(homeAlert(r, 0).title).toBe("Bill due 10 Nov");
    expect(homeAlert(r, 0).facts[1]).toEqual({ label: "Cash needed", value: "₹2.02L", caption: "for 24 days" });
    const g = gapView(r);
    expect(g.headline).toBe("Cash shortfall: ₹2.02L on 10 Nov");
    expect(g.duration).toBe("on 10 Nov");
    expect(g.dueLine).toBeNull();
  });
  it("says there is enough cash when nothing is short", () => {
    expect(gapView(runDefault(10)).headline).toBe("No cash shortfall");
  });
});

describe("at -30% sales the plan cannot cover the bill", () => {
  const r = runDefault(30);
  const hero = buildHeroPlan(r, r.recommendedView, forecastSaving(r, r.recommendedView, state(30)));
  it("recommends paying on the due date and says the limits do not cover it", () => {
    expect(r.recommended.recommended.timing).toBe("on_due_date");
    expect(hero.covered).toBe(false);
    expect(UNCOVERED_TITLE).toBe("Your limits don't cover this bill");
    expect(hero.closingLine).toBeNull();
    expect(r.recommended.recommended.plan.uncovered).toBeGreaterThan(0);
  });
  it("offers three plain options instead of a cost table", () => {
    expect(hero.uncoveredOptions).toEqual(["Ask the supplier for more days", "Pay part now, the rest on 10 Nov", "Ask your lender for a higher limit"]);
  });
  it("the screen shows no cost table, total or Backup line, keeps approve disabled and still offers the call script", () => {
    const o = readFileSync("components/OptionsScreen.tsx", "utf8");
    const uncoveredCard = o.slice(o.indexOf("if (!hero.covered)"), o.indexOf("aria-label=\"Recommended plan\"", o.indexOf("if (!hero.covered)") + 80));
    expect(uncoveredCard).toContain("UNCOVERED_TITLE");
    expect(uncoveredCard).toContain("actions(true)");
    expect(uncoveredCard).not.toMatch(/Total cost|hero\.backup|hero\.rows/);
    expect(o).toContain("recView.gap.gapExpected > 0 && (");
  });
});

describe("why the plan pays on the due date", () => {
  it("gives one plain reason when a discount was on offer but is not taken", () => {
    expect(payEarlyReason(runDefault(8).recommended)).toBe("Paying early would leave you short if sales are low.");
    expect(payEarlyReason(runDefault(30).recommended)).toBe("Limits can't cover paying early.");
    expect(buildHeroPlan(runDefault(10), "keep_full", 0).reason).toBe("Paying early would leave you short if sales are low.");
  });
  it("gives none when the plan pays early or there is no discount", () => {
    expect(payEarlyReason(runDefault(0).recommended)).toBeNull();
    expect(payEarlyReason(runEngine({ merchant, invoice: { ...defaultInvoice, earlyPayDiscountPct: 0 } }).recommended)).toBeNull();
  });
  it("flips from paying early to paying on the due date between -7% and -8% sales, because the low-sales case stops being covered", () => {
    expect(runDefault(7).recommended.recommended.timing).toBe("pay_early_for_discount");
    const at8 = runDefault(8).recommended;
    expect(at8.recommended.timing).toBe("on_due_date");
    expect(at8.earlyPlan.fullyCovered).toBe(true);
    expect(at8.earlyPlan.simLow.feasible).toBe(false);
    expect(at8.discount.netSaving).toBeGreaterThan(0);
  });
});

describe("how long the money is out", () => {
  it("is about a week in the demo: borrowed on 21 Oct, repaid by 29 Oct", () => {
    expect(aboutHowLong(runDefault().recommended)).toBe("about a week");
  });
});

describe("Repaid by, and the day-by-day table", () => {
  const r = runDefault();
  it("the plan rows say the date each loan is repaid, and your own cash has none", () => {
    const hero = buildHeroPlan(r, "keep_full", 9_583);
    expect(hero.rows.map((x) => [x.label, x.repaidBy])).toEqual([["Your cash", null], ["Your bank overdraft", "29 Oct"], ["Razorpay credit line", "26 Oct"]]);
  });
  it("lists the balances and the interest each day, and the interest adds up to the total cost", () => {
    const { rows, total } = dayByDay(r, "keep_full");
    expect(rows[0]).toEqual({ date: "21 Oct", overdraft: 100_000, credit: 130_900, interest: "₹94.69" });
    expect(rows.at(-1)?.date).toBe("28 Oct");
    const sum = rows.reduce((t, x) => t + Number(x.interest.slice(1)), 0);
    expect(Math.round(sum)).toBe(417);
    expect(total).toBe("₹417");
  });
  it("lists nothing when nothing is borrowed", () => {
    expect(dayByDay(runDefault(0, { cashElsewhere: 5_000_000 }), "keep_full").rows).toEqual([]);
  });
});

describe("Bill", () => {
  it("shows the early-payment opportunity from the fields as typed", () => {
    const h = billHero({ totalAmount: "5,00,000", invoiceDate: "2026-10-11", dueDate: "2026-11-10", earlyPaymentDiscountPercent: "2", earlyPaymentDiscountDays: "10" });
    expect(h).toEqual({ hero: "₹10,000 off", caption: "Pay ₹4.90L by 21 Oct instead of ₹5.00L by 10 Nov." });
  });
  it("shows nothing when the bill has no discount or a field is empty", () => {
    expect(billHero({ totalAmount: "500000", invoiceDate: "2026-10-11", dueDate: "2026-11-10", earlyPaymentDiscountPercent: "", earlyPaymentDiscountDays: "10" })).toBeNull();
    expect(billHero({ totalAmount: "", invoiceDate: "2026-10-11", dueDate: "2026-11-10", earlyPaymentDiscountPercent: "2", earlyPaymentDiscountDays: "10" })).toBeNull();
  });
  it("carries the late-interest law line and the privacy line as written", () => {
    expect(LATE_FEE_LAW).toBe("Registered micro and small suppliers can charge late interest of 3x the RBI bank rate, compounded monthly.");
    expect(BILL_PRIVACY).toBe("We don't store your bill. It is shared with our AI provider only to read it.");
  });
});

describe("labels", () => {
  it("the funding table rows", () => {
    expect(SOURCE_ROW.own_cash).toBe("Your cash");
    expect(SOURCE_ROW.bank_overdraft).toBe("Your bank overdraft");
    expect(SOURCE_ROW.credit_line).toBe("Razorpay credit line");
  });
  it("the Compare options names", () => {
    expect(OPTION_LABEL.early_settlement).toBe("Instant settlement");
    expect(OPTION_LABEL.bank_overdraft).toBe("Bank overdraft");
    expect(OPTION_LABEL.credit_line).toBe("Razorpay credit line");
    expect(OPTION_LABEL.split_order).toBe("Split the order");
  });
  it("every label is at most four words", () => {
    for (const l of [...Object.values(SOURCE_ROW), ...Object.values(OPTION_LABEL)]) expect(words(l), l).toBeLessThanOrEqual(4);
  });
});

describe("the one headline saving", () => {
  it("is the number the Results screen shows for 'as forecast', for every slider value", () => {
    for (const drop of DROPS) {
      const r = run(drop);
      expect(forecastSaving(r, "keep_full", state(drop)), `-${drop}%`).toBe(outcomeForState(r, { chosenView: "keep_full", ...state(drop) }, "as_forecast")!.cost.moneySaved);
    }
  });
  it("is not thrown off by a real journey state, whose own chosenView is null until the founder chooses", () => {
    const r = run(0);
    const journey = { ...DEFAULT_JOURNEY, invoice: defaultInvoice, chosenView: null };
    expect(forecastSaving(r, "keep_full", journey)).toBe(9_583);
    expect(forecastSaving(r, "keep_full", { ...journey, chosenView: "right_sized" })).toBe(9_583);
  });
});

describe("the recommended plan card", () => {
  const r = runDefault(0);
  const hero = buildHeroPlan(r, r.recommendedView, forecastSaving(r, r.recommendedView, state()));

  it("has the title and caption as written, bound to the engine", () => {
    expect(hero.title).toBe("Pay early and keep ₹9,583");
    expect(hero.subtitle).toBe("Pay ₹4.90L by 21 Oct to get the ₹10,000 discount.");
    expect(hero.discount).toBe(10_000);
    expect(hero.caption).toBe("Net benefit ₹9,583");
    expect(hero.saving).toBe(9_583);
  });
  it("has the funding table as written: source, amount, days, cost, then the total", () => {
    expect(hero.rows.map((x) => [x.label, x.amount, x.days, x.cost])).toEqual([
      ["Your cash", 259_100, null, 0],
      ["Your bank overdraft", 100_000, 8, 208],
      ["Razorpay credit line", 130_900, 5, 209],
    ]);
    expect(hero.totalCost).toBe(417);
    expect(hero.rows.reduce((t, x) => t + x.cost, 0)).toBe(hero.totalCost);
    expect(hero.rows.reduce((t, x) => t + x.share, 0)).toBeCloseTo(1, 9);
  });
  it("has the closing line, the backup line and the footer as written", () => {
    expect(hero.closingLine).toBe("Loans are repaid as sales money arrives.");
    expect(hero.backup).toEqual({ text: "Backup credit ₹1,69,100 unused. No cost unless used.", warn: false });
    expect(hero.footer).toBe("Rates are illustrative. Final terms are in your Key Fact Statement.");
  });
  it("has no old insight chip and no yearly rate anywhere", () => {
    expect(JSON.stringify(hero)).not.toMatch(/54\.75|a year|insight/);
  });
  it("says 'Pay on' with the due date when the plan does not pay early", () => {
    const rr = runEngine({ merchant, invoice: { ...defaultInvoice, earlyPayDiscountPct: 0 } });
    expect(buildHeroPlan(rr, "keep_full", 0).title).toBe("Pay on 10 Nov");
  });
  it("caption is honest when the plan is not better off", () => {
    expect(buildHeroPlan(r, r.recommendedView, 0).caption).toBe("Same cost as paying on the due date");
    expect(buildHeroPlan(r, r.recommendedView, -450).caption).toBe("₹450 more than paying on the due date");
  });
  it("warns, instead of the grey line, when slow sales would leave the plan short", () => {
    const rr = runDefault(30);
    const line = backupLine(rr.views.keepFull)!;
    expect(line.warn).toBe(true);
    expect(line.text).toMatch(/^Backup credit is ₹[\d,]+ short if sales are slow\.$/);
  });
  it("has no backup line when there is no credit line left to mention", () => {
    expect(backupLine(runDefault(0, { cashElsewhere: 5_000_000 }).views.keepFull)?.warn).toBe(false);
  });
  it("shows only your own cash when nothing is borrowed, and no closing line", () => {
    const rich = runDefault(0, { cashElsewhere: 5_000_000 });
    const h = buildHeroPlan(rich, "keep_full", 0);
    expect(h.hasLoans).toBe(false);
    expect(h.closingLine).toBeNull();
  });
  it("follows the copy rules: no brackets, because, n/a, em dashes or notes", () => {
    for (const drop of DROPS) {
      for (const cash of [0, 150_000]) {
        const rr = runDefault(drop, { cashElsewhere: cash });
        const h = buildHeroPlan(rr, rr.recommendedView, forecastSaving(rr, rr.recommendedView, state(drop, cash)));
        const texts = [h.title, h.caption, h.backup?.text ?? "", h.closingLine ?? "", ...h.rows.map((x) => x.label)];
        for (const t of texts) expect(t, `-${drop}% cash ${cash}`).not.toMatch(FORBIDDEN);
        for (const x of h.rows) expect(words(x.label)).toBeLessThanOrEqual(4);
        expect(`${h.title} ${h.caption} ${h.backup?.text ?? ""}`).not.toMatch(/[−-]₹|₹-/);
      }
    }
  });
});

describe("the Compare options table", () => {
  const r = runDefault(0);
  const rows = compareRows(r, "keep_full");

  it("has the five rows: overdraft, credit line, instant settlement, split order, order fewer pairs", () => {
    expect(rows.map((x) => x.label)).toEqual(["Bank overdraft", "Razorpay credit line", "Instant settlement", "Split the order", "Order fewer pairs"]);
  });
  it("says instant settlement is not needed, and why, when the plan does not use it", () => {
    expect(rows.find((x) => x.id === "early_settlement")).toMatchObject({ covers: "Not needed. Overdraft costs less.", cost: "-" });
  });
  it("shows 'Not needed' for ordering fewer pairs when it equals the full order", () => {
    expect(fewerPairsSameAsFull(r)).toBe(true);
    expect(rows.find((x) => x.id === "order_fewer")).toMatchObject({ label: "Order fewer pairs", covers: "Not needed" });
  });
  it("shows real figures for ordering fewer pairs when the forecast says some pairs won't sell", () => {
    const rr = runDefault(25);
    const row = compareRows(rr, "right_sized").find((x) => x.id === "order_fewer")!;
    expect(row.covers).toBe(formatINR(rr.stock.cashSaved));
    expect(row.covers).not.toBe("Not needed");
  });
  it("prices the overdraft and the credit line alone, for the days they would be used", () => {
    expect(rows.find((x) => x.id === "bank_overdraft")).toMatchObject({ covers: "₹1,00,000", cost: "₹208" });
    expect(rows.find((x) => x.id === "credit_line")).toMatchObject({ covers: "₹2,30,900", cost: "₹550" });
  });
  it("has no yearly rate column, no negative amounts and no forbidden words", () => {
    for (const drop of DROPS) {
      for (const id of ["keep_full", "right_sized"] as ViewId[]) {
        for (const x of compareRows(runDefault(drop), id)) {
          expect(Object.keys(x)).toEqual(["id", "label", "covers", "cost"]);
          for (const t of [x.label, x.covers, x.cost]) {
            expect(t, `${id} -${drop}% ${x.id}`).not.toMatch(FORBIDDEN);
            expect(t).not.toMatch(/[−-]₹|₹-|%/);
          }
        }
      }
    }
  });
});
