// THE SIZING RULE: every plan is sized to the peak cumulative shortfall over the whole window from today to
// the due date, not to the shortfall on one day. These tests check that three ways:
//   1. hand-worked scenarios, where the right answer is written out by hand;
//   2. a reference balance path rebuilt day by day with separate code, compared with the engine;
//   3. properties checked for EVERY plan, EVERY slider value (0 to -30%) and every sales scenario.

import { describe, expect, it } from "vitest";
import { merchant, type Merchant } from "../data/merchant";
import { sampleInvoice, type Invoice } from "../data/invoice";
import { earlyPayDay } from "../journey";
import { amountDueOn, computeGap } from "./gap";
import { runEngine, type EngineInput } from "./index";
import type { Plan } from "./options";
import { flatMerchant } from "./testing";
import type { Scenario } from "./config";

// ---------- Small merchants whose daily cash can be worked out by hand ----------

function handMerchant(over: Partial<Merchant> & { prepaidPerDay?: number } = {}): Merchant {
  const { prepaidPerDay = 0, ...rest } = over;
  const dailyOrders = Array.from({ length: 30 }, (_, i) => ({
    day: -29 + i,
    date: "test",
    orders: 1,
    prepaidValue: prepaidPerDay,
    codValue: 0,
  }));
  return { ...merchant, dailyOrders, settlementDays: 2, ...rest };
}

const handInvoice = (over: Partial<Invoice> = {}): Invoice => ({
  ...sampleInvoice,
  units: 200,
  unitPrice: 1000,
  amount: 200_000,
  ...over,
});

describe("hand-worked: no sales coming in, ₹50,000 going out every day", () => {
  // Balance starts at ₹1,00,000 and falls ₹50,000 a day. ₹2,00,000 invoice due on day 4,
  // or ₹1,80,000 (10% off) if paid by day 2.
  const m = handMerchant({ bankBalance: 100_000, otherOutflowsPerDay: 50_000 });
  const inv = handInvoice({ dueInDays: 4, earlyPayWithinDays: 2, earlyPayDiscountPct: 10 });
  const gap = (extra: Partial<Parameters<typeof computeGap>[0]> = {}) =>
    computeGap({ merchant: m, invoice: inv, ...extra }).scenarios.expected;

  it("paying on the due date: the balance path and the peak", () => {
    const s = gap();
    // day:  0        1       2   3        4
    expect(s.balanceByDay).toEqual([100_000, 50_000, 0, -50_000, 100_000 - 200_000 - 200_000]);
    expect(s.gap).toBe(300_000);
    expect(s.peak.day).toBe(4);
    expect(s.gapOnPayDay).toBe(300_000);
    expect(s.minBalance).toBe(-300_000);
  });

  it("paying early: sized to day 4 (₹2,80,000), NOT to the day-2 snapshot (₹1,80,000)", () => {
    const s = gap({ byDay: 2 });
    expect(s.balanceByDay).toEqual([100_000, 50_000, 0 - 180_000, -230_000, -280_000]);
    expect(s.gapOnPayDay).toBe(180_000); // what the old one-day rule would have used
    expect(s.gap).toBe(280_000); // the money keeps going out after payment
    expect(s.peak.day).toBe(4);
    expect(s.gap).toBeGreaterThan(s.gapOnPayDay);
  });

  it("an extended due date has its own, longer window", () => {
    const s = gap({ byDay: 6 });
    expect(s.balanceByDay).toHaveLength(7); // days 0 to 6
    expect(s.balanceByDay[6]).toBe(100_000 - 300_000 - 200_000); // paid in full: day 6 is after the discount window
    expect(s.gap).toBe(400_000);
    expect(s.peak.day).toBe(6);
  });

  it("the window ends on the due date, even when paying early", () => {
    const early = computeGap({ merchant: m, invoice: inv, byDay: 2 });
    expect(early.byDay).toBe(2);
    expect(early.windowEnd).toBe(4);
    expect(early.scenarios.expected.balanceByDay).toHaveLength(5);
    expect(computeGap({ merchant: m, invoice: inv }).windowEnd).toBe(4);
    expect(computeGap({ merchant: m, invoice: inv, byDay: 6 }).windowEnd).toBe(6);
  });

  it("cash available elsewhere lowers every day by the same amount", () => {
    const s = gap({ byDay: 2, cashElsewhere: 50_000 });
    expect(s.balanceByDay).toEqual([150_000, 100_000, 50_000 - 180_000, -180_000, -230_000]);
    expect(s.gap).toBe(230_000);
  });

  it("the whole engine sizes the early plan to the peak and covers it", () => {
    const r = runEngine({ merchant: m, invoice: inv });
    expect(r.views.keepFull.duePlan.gap).toBe(300_000);
    expect(r.views.keepFull.earlyPlan.gap).toBe(280_000);
    expect(r.views.keepFull.earlyPlan.fullyCovered).toBe(true);
    expect(r.views.keepFull.earlyPlan.covered).toBe(280_000);
  });
});

describe("hand-worked: the worst day is in the MIDDLE of the window", () => {
  // Nothing in the bank, ₹1,20,000 going out each day. ₹1,00,000 of prepaid sales arrives on each of days 1 and 2,
  // then (expected sales, 1.4x) ₹1,40,000 a day from day 3. A tiny ₹10,000 invoice is due on day 5.
  //   base(t) = -1,20,000 t + arrivals:  day1 -20k, day2 -40k, day3 -20k, day4 0, day5 +20k
  // The balance is lowest on day 2 (₹40,000 short) even though on the due date itself there is a surplus.
  const m = handMerchant({ bankBalance: 0, otherOutflowsPerDay: 120_000, prepaidPerDay: 100_000 });
  const inv = handInvoice({ amount: 10_000, units: 10, unitPrice: 1000, dueInDays: 5, earlyPayDiscountPct: 0, earlyPayWithinDays: 1 });
  const g = computeGap({ merchant: m, invoice: inv });

  it("expected sales: the peak is on day 2, which the due date alone would never show", () => {
    const s = g.scenarios.expected;
    expect(s.balanceByDay).toEqual([0, -20_000, -40_000, -20_000, 0, 20_000 - 10_000]);
    expect(s.gapOnPayDay).toBe(0); // on the due date there is cash to spare
    expect(s.gap).toBe(40_000); // but the balance dipped to -₹40,000 on day 2
    expect(s.peak.day).toBe(2);
    expect(s.minBalance).toBe(-40_000);
  });

  it("low sales (1.1x): the worst day is the last, ₹80,000", () => {
    const s = g.scenarios.low;
    expect(s.balanceByDay).toEqual([0, -20_000, -40_000, -50_000, -60_000, -70_000 - 10_000]);
    expect(s.gap).toBe(80_000);
    expect(s.peak.day).toBe(5);
  });

  it("high sales (1.7x): the worst day is day 2 again, ₹40,000", () => {
    const s = g.scenarios.high;
    expect(s.balanceByDay).toEqual([0, -20_000, -40_000, 10_000, 60_000, 110_000 - 10_000]);
    expect(s.gap).toBe(40_000);
    expect(s.peak.day).toBe(2);
  });

  it("the range uses the peaks", () => {
    expect([g.gapMin, g.gapExpected, g.gapMax]).toEqual([40_000, 40_000, 80_000]);
  });

  it("the plan is sized to the mid-window peak, so no day is negative", () => {
    const r = runEngine({ merchant: m, invoice: inv });
    const plan = r.views.keepFull.duePlan;
    expect(plan.gap).toBe(40_000);
    expect(plan.fullyCovered).toBe(true);
    const balances = r.views.keepFull.gap.scenarios.expected.balanceByDay;
    expect(balances.every((b) => b + plan.covered >= 0)).toBe(true);
  });
});

describe("the early-settlement cap is measured on the day the shortfall peaks", () => {
  it("uses the prepaid sales earned by the peak day that settle after it", () => {
    const r = runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: 30 });
    const view = r.views.rightSized;
    const s = view.earlyGap.scenarios.expected;
    expect(s.peak.day).toBe(10); // the early plan's worst day is the due date, not the payment day (7)
    const cap = view.earlyOptions.find((o) => o.id === "early_settlement")!.maxAmount;
    expect(cap).toBe(s.peak.earnedNotSettled);
  });
});

describe("regression: the pay-early plan used to be sized to day 7 only", () => {
  const r = runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: 30 });
  it("right-sized order at -30%: peak ₹3,30,719 on day 10, not the day-7 figure of ₹2,91,349", () => {
    const s = r.views.rightSized.earlyGap.scenarios.expected;
    expect(s.gapOnPayDay).toBe(291_349);
    expect(s.gap).toBe(330_719);
    expect(r.views.rightSized.earlyPlan.gap).toBe(330_719);
    expect(r.views.rightSized.earlyPlan.fullyCovered).toBe(true);
  });
  it("keeping the full order at -30%: peak ₹4,63,999, not ₹4,24,629", () => {
    const s = r.views.keepFull.earlyGap.scenarios.expected;
    expect(s.gapOnPayDay).toBe(424_629);
    expect(s.gap).toBe(463_999);
  });
});

// ---------- A reference balance path, rebuilt with separate code ----------

/**
 * The balance on each day 0..windowEnd, rebuilt from the engine's point-in-time cash (cash in and other outflows
 * by each day, one `byDay` call at a time) with its own simple loop. It deliberately does not use `balanceByDay`.
 */
function referencePath(
  m: Merchant,
  invoice: Invoice,
  o: { drop: number; cashElsewhere: number; scenario: Scenario; payDay: number; windowEnd: number },
): number[] {
  const paid = Math.round(amountDueOn(invoice, o.payDay));
  const path: number[] = [];
  for (let t = 0; t <= o.windowEnd; t++) {
    const s = computeGap({
      merchant: m,
      invoice,
      salesDropPercent: o.drop,
      cashElsewhere: o.cashElsewhere,
      byDay: t,
      windowEnd: t,
    }).scenarios[o.scenario];
    path.push(s.cash.totalIn - s.otherOutflows - (t >= o.payDay ? paid : 0));
  }
  return path;
}

const ALL_DROPS = Array.from({ length: 31 }, (_, i) => i); // every whole % from 0 to -30
const SLIDER = [0, 10, 20, 30];
const SCENARIOS: Scenario[] = ["low", "expected", "high"];

const CASES: { name: string; merchant: Merchant; invoice: Invoice; cashElsewhere?: number }[] = [
  { name: "the sample invoice", merchant, invoice: sampleInvoice },
  { name: "a tiny discount, so it pays on the due date", merchant, invoice: { ...sampleInvoice, earlyPayDiscountPct: 0.01 } },
  { name: "a big 10% discount", merchant, invoice: { ...sampleInvoice, earlyPayDiscountPct: 10 } },
  { name: "cash available elsewhere", merchant, invoice: sampleInvoice, cashElsewhere: 150_000 },
  { name: "a bigger invoice", merchant, invoice: { ...sampleInvoice, amount: 800_000, units: 800, unitPrice: 1000 } },
  { name: "the flat merchant", merchant: flatMerchant(), invoice: sampleInvoice },
];

interface Checked {
  label: string;
  plan: Plan;
  payDay: number;
  windowEnd: number;
  invoice: Invoice;
  /** The engine's own balance path for this plan, to compare with the reference. */
  engineBalances: number[];
}

/** Every plan the engine produces for one run: due-date, pay-early, recommended and "ask first", in both views. */
function plansOf(
  r: ReturnType<typeof runEngine>,
  scenario: Scenario,
  m: Merchant,
  drop: number,
  cashElsewhere: number,
): Checked[] {
  const out: Checked[] = [];
  for (const [name, v] of [["keep full", r.views.keepFull], ["right-sized", r.views.rightSized]] as const) {
    const due = v.invoice.dueInDays;
    const early = earlyPayDay(v.invoice);
    out.push({ label: `${name}: due-date plan`, plan: v.duePlan, payDay: due, windowEnd: due, invoice: v.invoice, engineBalances: v.gap.scenarios[scenario].balanceByDay });
    out.push({ label: `${name}: pay-early plan`, plan: v.earlyPlan, payDay: early, windowEnd: due, invoice: v.invoice, engineBalances: v.earlyGap.scenarios[scenario].balanceByDay });
    const rec = v.recommended.timing === "pay_early_for_discount" ? out[out.length - 1] : out[out.length - 2];
    out.push({ ...rec, label: `${name}: recommended plan` });
    const ext = due + v.askFirst.extraDays;
    const extGap = computeGap({ merchant: m, invoice: v.invoice, byDay: ext, salesDropPercent: drop, cashElsewhere });
    out.push({ label: `${name}: ask-first (extended) plan`, plan: v.askFirst.planAtExtendedDate, payDay: ext, windowEnd: ext, invoice: v.invoice, engineBalances: extGap.scenarios[scenario].balanceByDay });
  }
  return out;
}

describe("every plan is sized to the peak cumulative shortfall (all slider values, all scenarios)", () => {
  for (const c of CASES) {
    it(`${c.name}: peak sizing holds for every whole % from 0 to -30%`, () => {
      const problems: string[] = [];
      let planChecks = 0;
      let positivePeaks = 0;

      for (const drop of ALL_DROPS) {
        for (const scenario of SCENARIOS) {
          const input: EngineInput = { merchant: c.merchant, invoice: c.invoice, salesDropPercent: drop, cashElsewhere: c.cashElsewhere, planScenario: scenario };
          const r = runEngine(input);
          const cache = new Map<string, number[]>();
          const reference = (invoice: Invoice, payDay: number, windowEnd: number) => {
            const key = `${invoice.amount}-${payDay}-${windowEnd}`;
            if (!cache.has(key)) cache.set(key, referencePath(c.merchant, invoice, { drop, cashElsewhere: c.cashElsewhere ?? 0, scenario, payDay, windowEnd }));
            return cache.get(key)!;
          };

          for (const p of plansOf(r, scenario, c.merchant, drop, c.cashElsewhere ?? 0)) {
            planChecks++;
            const where = `${p.label} @ -${drop}% (${scenario})`;
            const balances = reference(p.invoice, p.payDay, p.windowEnd);
            const lowest = Math.min(...balances);
            const peak = Math.max(0, -lowest);
            if (peak > 0) positivePeaks++;

            // The engine's own day-by-day balance agrees with the separate reference.
            if (JSON.stringify(p.engineBalances) !== JSON.stringify(balances)) problems.push(`${where}: engine balance path differs from the reference`);
            // 1. The plan is sized to the PEAK, exactly.
            if (p.plan.gap !== peak) problems.push(`${where}: plan.gap ${p.plan.gap} is not the peak ${peak}`);
            // 2. ...which is never less than the shortfall on the payment day or on any other single day.
            for (let t = 0; t < balances.length; t++) {
              if (p.plan.gap < -balances[t]) problems.push(`${where}: plan.gap ${p.plan.gap} is below the day-${t} shortfall ${-balances[t]}`);
            }
            if (p.plan.covered + p.plan.uncovered !== p.plan.gap) problems.push(`${where}: covered + uncovered is not the gap`);

            if (p.plan.fullyCovered) {
              // 3. NO NEGATIVE BALANCE ON ANY DAY once the plan's funding is in.
              balances.forEach((b, t) => {
                if (b + p.plan.covered < 0) problems.push(`${where}: balance on day ${t} would be ${b + p.plan.covered}`);
              });
              // 4. ...and it is not oversized: the lowest day is brought to exactly zero.
              if (peak > 0 && lowest + p.plan.covered !== 0) problems.push(`${where}: funding ${p.plan.covered} overshoots the peak ${peak}`);
            } else if (!balances.some((b) => b + p.plan.covered < 0)) {
              // 5. A plan that is NOT fully covered really does leave a day short.
              problems.push(`${where}: marked not fully covered but no day is short`);
            }
          }
        }
      }

      expect(problems).toEqual([]);
      // Guard against a vacuous test: all four plans in both views, for 31 values x 3 scenarios.
      expect(planChecks).toBe(31 * 3 * 8);
      expect(positivePeaks).toBeGreaterThan(0);
    });
  }

  it("the recommended plan is one of the two timings and is sized to that timing's peak", () => {
    for (const drop of SLIDER) {
      const r = runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: drop });
      for (const v of [r.views.keepFull, r.views.rightSized]) {
        const chosen = v.recommended.timing === "pay_early_for_discount" ? v.earlyGap : v.gap;
        expect(v.recommended.plan.gap).toBe(chosen.scenarios.expected.gap);
        expect([v.duePlan, v.earlyPlan]).toContain(v.recommended.plan);
      }
    }
  });
});

describe("NO plan ever leaves a negative balance on any day (slider 0, -10, -20, -30%)", () => {
  it.each(SLIDER)("the recommended plans at -%i%, day by day", (drop) => {
    const r = runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: drop });
    for (const v of [r.views.keepFull, r.views.rightSized]) {
      const timing = v.recommended.timing;
      const g = timing === "pay_early_for_discount" ? v.earlyGap : v.gap;
      expect(v.recommended.plan.fullyCovered).toBe(true);
      g.scenarios.expected.balanceByDay.forEach((b, day) => {
        expect(b + v.recommended.plan.covered, `day ${day}, ${v.id}, -${drop}%`).toBeGreaterThanOrEqual(0);
      });
    }
  });

  it("an uncovered plan is the only kind that can go negative, and it says so", () => {
    const r = runEngine({ merchant, invoice: { ...sampleInvoice, amount: 5_000_000, units: 5000, unitPrice: 1000 } });
    const v = r.views.keepFull;
    expect(v.recommended.plan.fullyCovered).toBe(false);
    const balances = v.gap.scenarios.expected.balanceByDay;
    expect(balances.some((b) => b + v.recommended.plan.covered < 0)).toBe(true);
  });
});

describe("the peak never falls as sales fall", () => {
  it.each([
    ["the sample", merchant, sampleInvoice],
    ["the flat merchant", flatMerchant(), sampleInvoice],
  ] as const)("%s: a bigger sales drop never needs less funding", (_n, m, invoice) => {
    let last = -1;
    for (const drop of ALL_DROPS) {
      const peak = computeGap({ merchant: m, invoice, salesDropPercent: drop }).gapExpected;
      expect(peak).toBeGreaterThanOrEqual(last);
      last = peak;
    }
  });
});
