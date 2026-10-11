import { describe, expect, it } from "vitest";
import { defaultInvoice } from "./data/default-scenario";
import { merchant } from "./data/merchant";
import { sampleInvoice } from "./data/invoice";
import { runEngine, type ViewId } from "./engine";
import { formatCompactINR, formatDayMonth, formatINR } from "./format";
import { DEFAULT_JOURNEY } from "./journey";
import { OPTION_LABEL, SOURCE_ROW, backupLine, buildHeroPlan, compareRows, dayLabel, fewerPairsSameAsFull, forecastSaving, tidyName } from "./plain";
import { outcomeForState } from "./results";

const run = (drop = 0, extra = {}) => runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: drop, ...extra });
const runDefault = (drop = 0, extra = {}) => runEngine({ merchant, invoice: defaultInvoice, salesDropPercent: drop, ...extra });
const state = (drop = 0, cashElsewhere = 0) => ({ salesDropPercent: drop, cashElsewhere });
const DROPS = [0, 5, 10, 15, 20, 25, 30];
const words = (s: string) => s.trim().split(/\s+/).length;
/** Anything the copy rules forbid on a default view. */
const FORBIDDEN = /\(|\)|because|n\/a|—|Note:|[A-Za-z]:\s/i;

describe("compact rupees and dates", () => {
  it("lakh, thousand and crore", () => {
    expect(formatCompactINR(227_621)).toBe("₹2.28L");
    expect(formatCompactINR(51_637)).toBe("₹52K");
    expect(formatCompactINR(99_600)).toBe("₹1L");
    expect(formatCompactINR(12_500_000)).toBe("₹1.25Cr");
  });
  it("a date a number of days away", () => {
    expect(formatDayMonth("2026-10-11", 10)).toBe("21 Oct");
    expect(formatDayMonth("2026-10-11", 7)).toBe("18 Oct");
    expect(formatDayMonth("2026-12-28", 5)).toBe("2 Jan");
  });
});

describe("the default scenario is the pre-read sample bill", () => {
  it("is Shree Ganesh Footwear, ₹5,00,000, due in 10 days, and its dates are real", () => {
    expect(defaultInvoice.supplier).toBe("Shree Ganesh Footwear Pvt Ltd");
    expect(defaultInvoice.amount).toBe(500_000);
    expect(defaultInvoice.dueInDays).toBe(10);
    expect(defaultInvoice.startDate).toBe("2026-10-11");
    expect(dayLabel(defaultInvoice, defaultInvoice.dueInDays)).toBe("21 Oct");
    expect(dayLabel(defaultInvoice, defaultInvoice.earlyPayWithinDays)).toBe("18 Oct");
  });
  it("tidyName drops the company form", () => {
    expect(tidyName(defaultInvoice.supplier)).toBe("Shree Ganesh Footwear");
    expect(tidyName("Mehta Leather Works LLP")).toBe("Mehta Leather Works");
    expect(tidyName("Acme")).toBe("Acme");
    expect(tidyName("Ltd")).toBe("Ltd");
  });
  it("gives the Home numbers: cash in ₹13,22,379, cash out ₹15,50,000, likely short ₹2,27,621", () => {
    const gap = runDefault().views.keepFull.gap;
    expect(gap.scenarios.expected.cash.totalIn).toBe(1_322_379);
    expect(gap.scenarios.expected.cashOut).toBe(1_550_000);
    expect(gap.gapExpected).toBe(227_621);
  });
  it("without a start date, dates count from the demo's today", () => {
    expect(dayLabel(sampleInvoice, 10)).toBe("20 Oct");
  });
});

describe("labels", () => {
  it("the funding table rows", () => {
    expect(SOURCE_ROW.early_settlement).toBe("Settle your sales early");
    expect(SOURCE_ROW.bank_overdraft).toBe("Your bank overdraft");
    expect(SOURCE_ROW.credit_line).toBe("Razorpay credit line");
  });
  it("the All options names", () => {
    expect(OPTION_LABEL.early_settlement).toBe("Settle sales early");
    expect(OPTION_LABEL.bank_overdraft).toBe("Bank overdraft");
    expect(OPTION_LABEL.credit_line).toBe("Razorpay credit line");
    expect(OPTION_LABEL.split_order).toBe("Split the order");
  });
  it("every label is at most four words", () => {
    for (const l of [...Object.values(SOURCE_ROW), ...Object.values(OPTION_LABEL)]) expect(words(l), l).toBeLessThanOrEqual(4);
  });
  it("leaves the engine's own names alone", () => {
    expect(run().views.keepFull.options.map((o) => o.name)).toContain("Early settlement");
  });
});

describe("the one headline saving", () => {
  it("is the number the Results screen shows for 'as forecast', for every plan and slider value", () => {
    for (const drop of DROPS) {
      const r = run(drop);
      for (const view of ["keep_full", "right_sized"] as ViewId[]) {
        expect(forecastSaving(r, view, state(drop)), `${view} -${drop}%`).toBe(outcomeForState(r, { chosenView: view, ...state(drop) }, "as_forecast")!.cost.moneySaved);
      }
    }
  });
  it("is not thrown off by a real journey state, whose own chosenView is null until the founder chooses", () => {
    const r = run(0);
    const journey = { ...DEFAULT_JOURNEY, invoice: sampleInvoice, chosenView: null };
    expect(forecastSaving(r, "keep_full", journey)).toBe(11_310);
    expect(forecastSaving(r, "keep_full", { ...journey, chosenView: "right_sized" })).toBe(11_310);
  });
});

describe("the recommended plan card", () => {
  const r = runDefault(0);
  const hero = buildHeroPlan(r, r.recommendedView, forecastSaving(r, r.recommendedView, state()));

  it("has the title and caption as written, bound to the engine", () => {
    expect(hero.title).toBe("Pay by 18 Oct and get ₹10,000 off");
    expect(hero.caption).toBe("₹11,310 better off than borrowing the usual way");
    expect(hero.saving).toBe(11_310);
  });
  it("has the funding table as written: source, amount, days, cost, then the total", () => {
    expect(hero.rows.map((x) => [x.label, x.amount, x.days, x.cost])).toEqual([
      ["Settle your sales early", 170_987, 2, 513],
      ["Your bank overdraft", 100_000, 33, 1_266],
      ["Razorpay credit line", 17_164, 33, 279],
    ]);
    expect(hero.totalCost).toBe(2_058);
    expect(hero.rows.reduce((t, x) => t + x.cost, 0)).toBe(hero.totalCost);
    expect(hero.rows.reduce((t, x) => t + x.share, 0)).toBeCloseTo(1, 9);
  });
  it("has the green chip and the grey backup line as written", () => {
    expect(hero.insight).toBe("Early settlement is costly per year, but you need it for only 2 days.");
    expect(hero.backup).toEqual({ text: "Backup ₹1,05,454 on your credit line if sales are slow. No cost unless used.", warn: false });
  });
  it("uses 33 days for every loan, at every slider value and for both plans", () => {
    for (const drop of DROPS) {
      const rr = runDefault(drop);
      for (const id of ["keep_full", "right_sized"] as ViewId[]) {
        for (const row of buildHeroPlan(rr, id, 0).rows) {
          if (row.id === "credit_line" || row.id === "bank_overdraft") expect(row.days, `${id} -${drop}%`).toBe(rr.views[id === "keep_full" ? "keepFull" : "rightSized"].recommended.timing === "pay_early_for_discount" ? 33 : 30);
        }
      }
    }
  });
  it("says 'Pay on' with the due date when the plan does not pay early", () => {
    const rr = runEngine({ merchant, invoice: { ...defaultInvoice, earlyPayDiscountPct: 0 } });
    expect(buildHeroPlan(rr, "keep_full", 0).title).toBe("Pay on 21 Oct");
  });
  it("caption is honest when the plan is not better off", () => {
    expect(buildHeroPlan(r, r.recommendedView, 0).caption).toBe("Same cost as borrowing the usual way");
    expect(buildHeroPlan(r, r.recommendedView, -450).caption).toBe("₹450 more than borrowing the usual way");
  });
  it("shows an order chip only when the order is cut", () => {
    expect(hero.orderChip).toBeNull();
    const cut = runDefault(30);
    expect(cut.recommendedView).toBe("right_sized");
    expect(buildHeroPlan(cut, "right_sized", 0).orderChip).toBe(`Order ${cut.views.rightSized.units} of ${cut.stock.fullUnits} pairs`);
  });
  it("warns, instead of the grey line, when the unused credit line cannot cover the backup", () => {
    const rr = runDefault(30);
    const line = backupLine(rr.views.keepFull)!;
    expect(line.warn).toBe(true);
    expect(line.text).toMatch(/^Backup ₹[\d,]+ needs ₹[\d,]+ more credit\.$/);
  });
  it("says there is no backup line when the plan already covers low sales", () => {
    expect(backupLine(runDefault(0, { cashElsewhere: 5_000_000 }).views.keepFull)).toBeNull();
  });
  it("with no borrowing, shows no table", () => {
    const rich = runDefault(0, { cashElsewhere: 5_000_000 });
    const h = buildHeroPlan(rich, "keep_full", 0);
    expect(h.noBorrowing).toBe(true);
    expect(h.rows).toEqual([]);
  });
  it("follows the copy rules: no brackets, because, n/a, em dashes, notes or colons in a sentence", () => {
    for (const drop of DROPS) {
      for (const cash of [0, 150_000]) {
        const rr = runDefault(drop, { cashElsewhere: cash });
        const h = buildHeroPlan(rr, rr.recommendedView, forecastSaving(rr, rr.recommendedView, state(drop, cash)));
        const texts = [h.title, h.caption, h.orderChip ?? "", h.insight ?? "", h.backup?.text ?? "", ...h.rows.map((x) => x.label)];
        for (const t of texts) expect(t, `-${drop}% cash ${cash}`).not.toMatch(FORBIDDEN);
        expect(words(h.caption), h.caption).toBeLessThanOrEqual(8);
        for (const x of h.rows) expect(words(x.label)).toBeLessThanOrEqual(4);
        expect(`${h.title} ${h.caption} ${h.backup?.text ?? ""}`).not.toMatch(/[−-]₹|₹-/);
      }
    }
  });
});

describe("the All options table", () => {
  const r = runDefault(0);
  const rows = compareRows(r, "keep_full");

  it("has the six rows as written", () => {
    const labels = rows.map((x) => x.label);
    for (const label of ["Settle sales early", "Bank overdraft", "Razorpay credit line", "Split the order", "Order fewer pairs", "Pay early for discount"]) {
      expect(labels).toContain(label);
    }
    expect(rows).toHaveLength(6);
  });
  it("shows 'Not needed' for ordering fewer pairs when it equals the full order, and nowhere else", () => {
    expect(fewerPairsSameAsFull(r)).toBe(true);
    expect(rows.find((x) => x.id === "order_fewer")).toMatchObject({ label: "Order fewer pairs", covers: "Not needed" });
    expect(rows.filter((x) => x.covers === "Not needed")).toHaveLength(1);
  });
  it("shows real figures for ordering fewer pairs when the forecast says some pairs won't sell", () => {
    const rr = runDefault(25);
    const row = compareRows(rr, "right_sized").find((x) => x.id === "order_fewer")!;
    expect(row.covers).toBe(formatINR(rr.stock.cashSaved));
    expect(row.covers).not.toBe("Not needed");
  });
  it("prices the overdraft at the plan's 33 days: ₹1,266 on ₹1,00,000, 14% a year", () => {
    const od = rows.find((x) => x.id === "bank_overdraft")!;
    expect(od).toMatchObject({ covers: "₹1,00,000", cost: "₹1,266", yearly: "14%" });
  });
  it("prices early money at ₹513, with its 54.75% yearly rate", () => {
    expect(rows.find((x) => x.id === "early_settlement")).toMatchObject({ covers: "₹1,70,987", cost: "₹513", yearly: "54.75%" });
  });
  it("shows the discount as ₹10,000 against ₹893 more interest", () => {
    expect(rows.find((x) => x.id === "pay_early")).toMatchObject({ covers: "₹10,000", cost: "₹893" });
  });
  it("has no sentences, no negative amounts and no forbidden words", () => {
    for (const drop of DROPS) {
      for (const id of ["keep_full", "right_sized"] as ViewId[]) {
        for (const x of compareRows(runDefault(drop), id)) {
          for (const t of [x.label, x.covers, x.cost, x.yearly]) {
            expect(t, `${id} -${drop}% ${x.id}`).not.toMatch(FORBIDDEN);
            expect(t).not.toMatch(/[−-]₹|₹-/);
          }
        }
      }
    }
  });
});
