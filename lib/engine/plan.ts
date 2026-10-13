// The planner: works out, day by day, how to pay the supplier. Plain TypeScript, no AI. All amounts in ₹.
//
// On top of the cash path (the balance if nothing were paid and nothing borrowed), the supplier payment goes out on its day.
// Whenever the balance would fall below the safety buffer, money is drawn from the sources in a chosen order. Whenever there
// is cash above the buffer, loans are repaid at once, the most expensive first. Interest is charged per day on what is
// outstanding, so it is paid only for the days the money is actually used. The founder's own cash is used first, simply
// because it is already in the balance. Instant settlement (your own sales money, early) costs a flat fee each time and is
// never forced in: every order of the sources is tried and the cheapest feasible one is kept.

import { CONFIG } from "./config";
import type { CashSeries } from "./gap";
import type { Merchant } from "../data/merchant";

export type SourceId = "bank_overdraft" | "credit_line" | "early_settlement";
export const SOURCE_IDS: SourceId[] = ["bank_overdraft", "credit_line", "early_settlement"];
type LoanId = "bank_overdraft" | "credit_line";

export interface Terms {
  overdraft: { limit: number; ratePct: number };
  creditLine: { limit: number; ratePct: number };
  /** Instant settlement: a flat fee on each settlement (with GST on the fee), up to a daily limit. */
  instant: { feePct: number; limitPerDay: number; settlementDays: number };
}

export function termsFor(merchant: Merchant, overdraftRatePct?: number): Terms {
  return {
    overdraft: { limit: merchant.overdraftLimit, ratePct: overdraftRatePct ?? CONFIG.overdraftRatePct },
    creditLine: { limit: merchant.creditLineLimit, ratePct: CONFIG.creditLineRatePct },
    instant: {
      feePct: CONFIG.earlySettlementFeePct * (1 + CONFIG.earlySettlementGstPct / 100),
      limitPerDay: CONFIG.earlySettlementDailyLimit,
      settlementDays: merchant.settlementDays,
    },
  };
}

export interface SourceStats {
  id: SourceId;
  /** The most outstanding at the end of any day. */
  peak: number;
  /** Everything drawn, counting each draw. */
  drawn: number;
  /** Days with something outstanding. */
  days: number;
  /** Interest paid, or fees for instant settlement. */
  cost: number;
  firstDay: number | null;
  /** The day it was fully repaid, or null if it never was drawn or is still owed at the end. */
  closedDay: number | null;
}

export interface PlanSim {
  order: SourceId[];
  payDay: number;
  payAmount: number;
  buffer: number;
  /** True if the balance never fell below the safety buffer: every shortfall was covered. */
  feasible: boolean;
  /** The most the balance fell below the buffer with no source left to draw from. Zero if feasible. */
  uncoveredPeak: number;
  stats: Record<SourceId, SourceStats>;
  /** The part of the supplier payment that came from the founder's own cash, above the buffer. */
  ownCashUsed: number;
  totalCost: number;
  /** The most owed on the overdraft and credit line together. */
  peakBorrowed: number;
  /** The day the overdraft and credit line were both back to zero. */
  closedDay: number | null;
  /** Balance and loans outstanding at the end of each day simulated. */
  balanceByDay: number[];
  debtByDay: number[];
}

export interface SimInput {
  series: CashSeries;
  payDay: number;
  payAmount: number;
  order: SourceId[];
  terms: Terms;
  buffer?: number;
  /** The last day to simulate. The run stops sooner once everything is repaid. */
  horizon: number;
}

const LOANS: LoanId[] = ["bank_overdraft", "credit_line"];

export function simulate(input: SimInput): PlanSim {
  const { series, payDay, payAmount, order, terms } = input;
  const buffer = input.buffer ?? CONFIG.safetyBufferRupees;
  const horizon = Math.min(input.horizon, series.balance.length - 1);
  const limit: Record<LoanId, number> = { bank_overdraft: terms.overdraft.limit, credit_line: terms.creditLine.limit };
  const rate: Record<LoanId, number> = { bank_overdraft: terms.overdraft.ratePct, credit_line: terms.creditLine.ratePct };
  // Repay the most expensive loan first.
  const repayOrder = [...LOANS].sort((a, b) => rate[b] - rate[a]);

  const stats = Object.fromEntries(
    SOURCE_IDS.map((id) => [id, { id, peak: 0, drawn: 0, days: 0, cost: 0, firstDay: null, closedDay: null } as SourceStats]),
  ) as Record<SourceId, SourceStats>;
  const debt: Record<LoanId, number> = { bank_overdraft: 0, credit_line: 0 };
  const accrued: Record<LoanId, number> = { bank_overdraft: 0, credit_line: 0 };
  const lastOwed: Record<LoanId, number | null> = { bank_overdraft: null, credit_line: null };
  const claw = new Array(horizon + terms.instant.settlementDays + 2).fill(0) as number[];
  let advanceOut = 0;
  let cash = 0;
  let cashBeforePay = 0;
  let uncoveredPeak = 0;
  let peakBorrowed = 0;
  let closedDay: number | null = null;
  let everBorrowed = false;
  const balanceByDay: number[] = [];
  const debtByDay: number[] = [];

  for (let t = 0; t <= horizon; t++) {
    cash += t === 0 ? series.balance[0] : series.balance[t] - series.balance[t - 1];
    if (t === payDay) {
      cashBeforePay = cash;
      cash -= payAmount;
    }
    if (claw[t] > 0) {
      cash -= claw[t];
      advanceOut -= claw[t];
    }

    if (cash < buffer) {
      let need = buffer - cash;
      let instantToday = 0;
      for (const id of order) {
        if (need <= 1e-9) break;
        if (id === "early_settlement") {
          const room = Math.min(series.earnedNotSettled[t] - advanceOut, terms.instant.limitPerDay - instantToday);
          if (room <= 0) continue;
          const fee = terms.instant.feePct / 100;
          const gross = Math.min(room, need / (1 - fee));
          cash += gross * (1 - fee);
          need -= gross * (1 - fee);
          const s = stats.early_settlement;
          s.drawn += gross;
          s.cost += gross * fee;
          s.firstDay ??= t;
          advanceOut += gross;
          s.peak = Math.max(s.peak, advanceOut);
          claw[t + terms.instant.settlementDays] += gross;
          instantToday += gross;
        } else {
          const x = Math.min(need, limit[id] - debt[id]);
          if (x <= 0) continue;
          debt[id] += x;
          cash += x;
          need -= x;
          const s = stats[id];
          s.drawn += x;
          s.firstDay ??= t;
          everBorrowed = true;
        }
      }
      uncoveredPeak = Math.max(uncoveredPeak, need);
    } else if (cash > buffer) {
      let excess = cash - buffer;
      for (const id of repayOrder) {
        if (excess <= 0) break;
        const interest = Math.min(excess, accrued[id]);
        accrued[id] -= interest;
        stats[id].cost += interest;
        cash -= interest;
        excess -= interest;
        const principal = Math.min(excess, debt[id]);
        debt[id] -= principal;
        cash -= principal;
        excess -= principal;
      }
    }

    // End of the day: interest accrues on what is still owed, and the day is counted.
    for (const id of LOANS) {
      if (debt[id] > 1e-9) {
        accrued[id] += (debt[id] * rate[id]) / 100 / CONFIG.daysPerYear;
        stats[id].days += 1;
        stats[id].peak = Math.max(stats[id].peak, debt[id]);
        lastOwed[id] = t;
      }
    }
    if (advanceOut > 1e-9) stats.early_settlement.days += 1;
    const owed = debt.bank_overdraft + debt.credit_line;
    peakBorrowed = Math.max(peakBorrowed, owed);
    balanceByDay.push(cash);
    debtByDay.push(owed);

    if (everBorrowed && closedDay === null && t >= payDay && owed <= 1e-9 && accrued.bank_overdraft + accrued.credit_line <= 1e-6) {
      closedDay = t;
    }
    // Stop once nothing is owed and nothing is coming back, after the payment has gone out.
    if (t >= payDay && owed <= 1e-9 && accrued.bank_overdraft + accrued.credit_line <= 1e-6 && advanceOut <= 1e-9) break;
  }

  for (const id of LOANS) {
    // Interest still owed when the run ends is part of the cost.
    stats[id].cost += accrued[id];
    stats[id].closedDay = stats[id].drawn > 0 && debt[id] <= 1e-9 && lastOwed[id] !== null ? lastOwed[id]! + 1 : null;
  }
  stats.early_settlement.closedDay = stats.early_settlement.drawn > 0 && advanceOut <= 1e-9 ? stats.early_settlement.firstDay : null;

  const used = SOURCE_IDS.reduce((total, id) => total + stats[id].cost, 0);
  return {
    order,
    payDay,
    payAmount,
    buffer,
    feasible: uncoveredPeak <= 1e-6,
    uncoveredPeak: Math.round(uncoveredPeak),
    stats,
    ownCashUsed: Math.round(Math.min(payAmount, Math.max(0, cashBeforePay - buffer))),
    totalCost: used,
    peakBorrowed: Math.round(peakBorrowed),
    closedDay: everBorrowed ? closedDay : null,
    balanceByDay,
    debtByDay,
  };
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]));
}

const sourcesUsed = (sim: PlanSim) => SOURCE_IDS.filter((id) => sim.stats[id].drawn > 0).length;

/**
 * The cheapest way to fund one payment: every order of the allowed sources is simulated, and the cheapest one that keeps
 * the buffer every day wins. Ties go to the plan that uses fewer sources, so instant settlement is never added for nothing.
 * If no order keeps the buffer, the one that leaves the least uncovered wins.
 */
export function bestPlan(input: Omit<SimInput, "order"> & { allowed?: SourceId[] }): PlanSim {
  const allowed = input.allowed ?? SOURCE_IDS;
  const sims = permutations(allowed).map((order) => simulate({ ...input, order }));
  return sims.reduce((best, s) => {
    if (s.feasible !== best.feasible) return s.feasible ? s : best;
    if (!s.feasible) return s.uncoveredPeak < best.uncoveredPeak || (s.uncoveredPeak === best.uncoveredPeak && s.totalCost < best.totalCost - 1e-6) ? s : best;
    if (s.totalCost < best.totalCost - 1e-6) return s;
    if (Math.abs(s.totalCost - best.totalCost) <= 1e-6 && sourcesUsed(s) < sourcesUsed(best)) return s;
    return best;
  });
}
