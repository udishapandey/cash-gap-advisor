// The cash-gap engine. Plain TypeScript, no AI. All amounts in ₹.
//
// Cash that has reached the bank by day D = bank balance + cash the founder has elsewhere
//   + prepaid sales already placed that settle by D          (settlements in transit)
//   + forecast prepaid sales that settle by D                (placed by day D - T)
//   + COD cash arriving by D x (1 - return rate)
// Other money out by day D = the daily outflows x D, and the invoice leaves on the day it is paid.
//
// THE SIZING RULE: a plan is never sized to one day's snapshot. The balance is worked out for EVERY
// day from today to the end of the window (the due date, or the extended due date), with the invoice
// paid on its payment day. The money to find is the PEAK cumulative shortfall: the lowest the balance
// would fall on any day. Funding of that size means the balance is never negative on any day.

import { CONFIG, SCENARIOS, type Scenario } from "./config";
import type { Merchant } from "../data/merchant";
import type { Invoice } from "../data/invoice";

export interface GapInput {
  merchant: Merchant;
  invoice: Invoice;
  /** What-if: forecast sales are this % lower than the scenario says. 0 = no change. */
  salesDropPercent?: number;
  /** The day the invoice is paid (default: the invoice due date). Paying early means a smaller invoice, sooner. */
  byDay?: number;
  /**
   * The last day the balance must stay at or above zero. Default: the due date, or the payment day if later
   * (an extended due date). Paying early still has to survive until the due date.
   */
  windowEnd?: number;
  /** Cash the founder has available elsewhere (another account, savings). Added to cash in. Default 0. */
  cashElsewhere?: number;
  /**
   * Actual sales as a multiple of the forecast (1 = as forecast, 1.15 = 15% higher). Used after the season, to see
   * what the real peak need turned out to be. Unlike salesDropPercent it can go above 1. Default 1.
   */
  salesVsForecast?: number;
  /** The least the account must hold on any day. The gap is how far the balance falls below it. Default: CONFIG.safetyBufferRupees. */
  buffer?: number;
}

export interface CashBreakdown {
  bankBalance: number;
  settlementsInTransit: number;
  forecastPrepaid: number;
  codPayouts: number; // already net of returns
  cashElsewhere: number; // entered by the founder, not simulated
  totalIn: number;
}

export interface PeakShortfall {
  /** The most cash short on any single day of the window: this is what a plan must cover. */
  shortfall: number;
  /** The first day that happens on (the payment day if there is no shortfall). */
  day: number;
  /** Prepaid sales earned by that day that would only settle after it: the cap on early settlement. */
  earnedNotSettled: number;
}

export interface ScenarioResult {
  scenario: Scenario;
  uplift: number;
  /** Cash in, as it stands on the payment day. */
  cash: CashBreakdown;
  /** Prepaid sales earned by the payment day that would only settle after it. */
  earnedNotSettled: number;
  invoiceDue: number;
  /** Other money out by the payment day. */
  otherOutflows: number;
  /** Invoice + other outflows, by the payment day. */
  cashOut: number;
  /** The peak cumulative shortfall over the whole window. Every plan is sized to this. */
  gap: number;
  /** Where that peak is. */
  peak: PeakShortfall;
  /** The shortfall on the payment day alone (cash out - cash in). Never more than `gap`. */
  gapOnPayDay: number;
  /** Cash left over on the payment day alone, if there is any. */
  surplus: number;
  /** The balance on each day, 0 to the end of the window, with the invoice paid and no funding. */
  balanceByDay: number[];
  /** The lowest that balance gets. Zero or more means no funding is needed. */
  minBalance: number;
}

export interface GapResult {
  byDay: number; // the payment day
  /** The last day of the window the balance is checked on. */
  windowEnd: number;
  salesDropPercent: number;
  scenarios: Record<Scenario, ScenarioResult>;
  gapMin: number; // best case (high sales)
  gapExpected: number;
  gapMax: number; // worst case (low sales)
  widthShare: number; // (gapMax - gapMin) / invoice amount
  lowConfidence: boolean;
}

const round = (n: number) => Math.round(n);

/** What the supplier wants if we pay on `day`: the discounted amount if early enough. */
export function amountDueOn(invoice: Invoice, day: number): number {
  const discounted = day <= invoice.earlyPayWithinDays;
  return invoice.amount * (discounted ? 1 - invoice.earlyPayDiscountPct / 100 : 1);
}

/** Average daily prepaid and COD sales over the most recent days. This is the forecast baseline. */
export function baselineDaily(merchant: Merchant): { prepaid: number; cod: number } {
  const recent = merchant.dailyOrders.slice(-CONFIG.baselineDays);
  const n = recent.length || 1;
  return {
    prepaid: recent.reduce((s, r) => s + r.prepaidValue, 0) / n,
    cod: recent.reduce((s, r) => s + r.codValue, 0) / n,
  };
}

/**
 * Share of COD cash, from orders placed on `placedDay`, that lands in the bank during
 * the days after today up to and including `byDay`. The payout delay is spread evenly
 * over min..max days. Cash that already landed before today is excluded (it's in the balance).
 */
export function codArrivalShare(
  placedDay: number,
  byDay: number,
  delay: { min: number; max: number },
): number {
  const span = delay.max - delay.min + 1;
  const arrivedBy = (k: number) => Math.min(1, Math.max(0, (Math.floor(k) - delay.min + 1) / span));
  return Math.max(0, arrivedBy(byDay - placedDay) - arrivedBy(-placedDay));
}

interface ScenarioContext {
  merchant: Merchant;
  forecastFactor: number;
  cashElsewhere: number;
  base: { prepaid: number; cod: number };
  history: Map<number, Merchant["dailyOrders"][number]>;
}

interface CashAt {
  cash: CashBreakdown;
  earnedNotSettled: number;
}

/** Everything that has reached the bank by the end of `day`, in one sales scenario. */
function cashByDay(ctx: ScenarioContext, day: number): CashAt {
  const { merchant, forecastFactor, base, history } = ctx;

  // Day d <= 0 uses the real (simulated) order history; d > 0 uses the forecast.
  const prepaidOn = (d: number) => (d <= 0 ? history.get(d)?.prepaidValue ?? 0 : base.prepaid * forecastFactor);
  const codOn = (d: number) => (d <= 0 ? history.get(d)?.codValue ?? 0 : base.cod * forecastFactor);

  // Prepaid: an order placed on day d reaches the bank on day d + T.
  const T = merchant.settlementDays;
  let inTransit = 0;
  let forecastPrepaid = 0;
  let earnedNotSettled = 0;
  for (let d = -(T - 1); d <= day; d++) {
    const settlesOn = d + T;
    const value = prepaidOn(d);
    if (settlesOn > day) earnedNotSettled += value;
    else if (d <= 0) inTransit += value;
    else forecastPrepaid += value;
  }

  // COD: arrives 5-9 days after the order, and returned orders never pay out.
  let codGross = 0;
  for (let d = -merchant.codPayoutDelayDays.max; d <= day; d++) {
    codGross += codOn(d) * codArrivalShare(d, day, merchant.codPayoutDelayDays);
  }

  const cash: CashBreakdown = {
    bankBalance: round(merchant.bankBalance),
    settlementsInTransit: round(inTransit),
    forecastPrepaid: round(forecastPrepaid),
    codPayouts: round(codGross * (1 - merchant.codReturnRate)),
    cashElsewhere: round(ctx.cashElsewhere),
    totalIn: 0,
  };
  cash.totalIn =
    cash.bankBalance + cash.settlementsInTransit + cash.forecastPrepaid + cash.codPayouts + cash.cashElsewhere;
  return { cash, earnedNotSettled: round(earnedNotSettled) };
}

function computeScenario(
  scenario: Scenario,
  input: Required<Pick<GapInput, "merchant" | "invoice" | "byDay" | "windowEnd" | "salesDropPercent" | "cashElsewhere" | "salesVsForecast" | "buffer">>,
): ScenarioResult {
  const { merchant, invoice, byDay: payDay, windowEnd, salesDropPercent, cashElsewhere, salesVsForecast, buffer } = input;
  const uplift = CONFIG.scenarioUplift[scenario];
  const ctx: ScenarioContext = {
    merchant,
    forecastFactor: uplift * (1 - salesDropPercent / 100) * salesVsForecast,
    cashElsewhere,
    base: baselineDaily(merchant),
    history: new Map(merchant.dailyOrders.map((r) => [r.day, r])),
  };

  // The payment day on its own, for the breakdown shown to the founder.
  const onPayDay = cashByDay(ctx, payDay);
  const invoiceDue = round(amountDueOn(invoice, payDay));
  const otherOutflows = round(merchant.otherOutflowsPerDay * payDay);
  const cashOut = invoiceDue + otherOutflows;
  const shortfallOnPayDay = cashOut + buffer - onPayDay.cash.totalIn;

  // The balance on every day of the window. The invoice leaves on the payment day and stays paid.
  const balanceByDay: number[] = [];
  let peak: PeakShortfall = { shortfall: 0, day: payDay, earnedNotSettled: onPayDay.earnedNotSettled };
  for (let t = 0; t <= windowEnd; t++) {
    const at = t === payDay ? onPayDay : cashByDay(ctx, t);
    const balance = at.cash.totalIn - round(merchant.otherOutflowsPerDay * t) - (t >= payDay ? invoiceDue : 0);
    balanceByDay.push(balance);
    if (buffer - balance > peak.shortfall) peak = { shortfall: buffer - balance, day: t, earnedNotSettled: at.earnedNotSettled };
  }

  return {
    scenario,
    uplift,
    cash: onPayDay.cash,
    earnedNotSettled: onPayDay.earnedNotSettled,
    invoiceDue,
    otherOutflows,
    cashOut,
    gap: peak.shortfall,
    peak,
    gapOnPayDay: Math.max(0, shortfallOnPayDay),
    surplus: Math.max(0, -shortfallOnPayDay),
    balanceByDay,
    minBalance: Math.min(...balanceByDay),
  };
}

export function computeGap(input: GapInput): GapResult {
  const byDay = input.byDay ?? input.invoice.dueInDays;
  // Paying early must still survive until the due date; an extended due date is the end of its own window.
  const windowEnd = Math.max(byDay, input.windowEnd ?? input.invoice.dueInDays);
  const salesDropPercent = Math.min(100, Math.max(0, input.salesDropPercent ?? 0));
  const cashElsewhere = Math.max(0, input.cashElsewhere ?? 0);
  const salesVsForecast = Math.max(0, input.salesVsForecast ?? 1);
  const buffer = Math.max(0, input.buffer ?? CONFIG.safetyBufferRupees);
  const args = { merchant: input.merchant, invoice: input.invoice, byDay, windowEnd, salesDropPercent, cashElsewhere, salesVsForecast, buffer };

  const scenarios = Object.fromEntries(
    SCENARIOS.map((s) => [s, computeScenario(s, args)]),
  ) as Record<Scenario, ScenarioResult>;

  const gapMin = scenarios.high.gap;
  const gapMax = scenarios.low.gap;
  const widthShare = (gapMax - gapMin) / input.invoice.amount;

  return {
    byDay,
    windowEnd,
    salesDropPercent,
    scenarios,
    gapMin,
    gapExpected: scenarios.expected.gap,
    gapMax,
    widthShare,
    lowConfidence: widthShare > CONFIG.lowConfidenceWidthShare,
  };
}

// ---------- The cash path, day by day ----------

export interface CashSeriesInput {
  merchant: Merchant;
  scenario: Scenario;
  /** What-if: forecast sales are this % lower. */
  salesDropPercent?: number;
  /** Actual sales as a multiple of the forecast. Default 1. */
  salesVsForecast?: number;
  cashElsewhere?: number;
  /** The last day to work out. Days after the bill window keep following the forecast. */
  horizon: number;
}

export interface CashSeries {
  /** The account balance at the end of each day, 0 to `horizon`, before any supplier payment and any borrowing. */
  balance: number[];
  /** Prepaid sales earned by each day that would only settle after it: the most instant settlement could bring forward. */
  earnedNotSettled: number[];
}

/**
 * The account balance for every day if nothing is paid to the supplier and nothing is borrowed. A plan is then worked out
 * on top of this path: the supplier payment goes out on its day, loans are drawn when the balance would fall below the
 * safety buffer and repaid as soon as cash allows.
 */
export function cashSeries(input: CashSeriesInput): CashSeries {
  const { merchant, scenario, horizon } = input;
  const ctx: ScenarioContext = {
    merchant,
    forecastFactor: CONFIG.scenarioUplift[scenario] * (1 - (input.salesDropPercent ?? 0) / 100) * Math.max(0, input.salesVsForecast ?? 1),
    cashElsewhere: Math.max(0, input.cashElsewhere ?? 0),
    base: baselineDaily(merchant),
    history: new Map(merchant.dailyOrders.map((r) => [r.day, r])),
  };
  const balance: number[] = [];
  const earnedNotSettled: number[] = [];
  for (let t = 0; t <= horizon; t++) {
    const at = cashByDay(ctx, t);
    balance.push(at.cash.totalIn - round(merchant.otherOutflowsPerDay * t));
    earnedNotSettled.push(at.earnedNotSettled);
  }
  return { balance, earnedNotSettled };
}
