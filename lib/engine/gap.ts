// The cash-gap engine. Plain TypeScript, no AI. All amounts in ₹.
//
// Cash available by day D = bank balance
//   + prepaid sales already placed that settle by D          (settlements in transit)
//   + forecast prepaid sales that settle by D                (placed by day D - T)
//   + COD cash arriving by D x (1 - return rate)
// Cash out by day D = invoice amount due + other committed outflows up to D.
// Gap = cash out - cash available (0 if there is a surplus).

import { CONFIG, SCENARIOS, type Scenario } from "./config";
import type { Merchant } from "../data/merchant";
import type { Invoice } from "../data/invoice";

export interface GapInput {
  merchant: Merchant;
  invoice: Invoice;
  /** What-if: forecast sales are this % lower than the scenario says. 0 = no change. */
  salesDropPercent?: number;
  /** Measure the gap at this day (default: the invoice due date). */
  byDay?: number;
}

export interface CashBreakdown {
  bankBalance: number;
  settlementsInTransit: number;
  forecastPrepaid: number;
  codPayouts: number; // already net of returns
  totalIn: number;
}

export interface ScenarioResult {
  scenario: Scenario;
  uplift: number;
  cash: CashBreakdown;
  /** Prepaid sales earned by the target day that would only settle after it. */
  earnedNotSettled: number;
  invoiceDue: number;
  otherOutflows: number;
  cashOut: number;
  gap: number;
  surplus: number;
}

export interface GapResult {
  byDay: number;
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

function computeScenario(
  scenario: Scenario,
  input: Required<Pick<GapInput, "merchant" | "invoice" | "byDay" | "salesDropPercent">>,
): ScenarioResult {
  const { merchant, invoice, byDay, salesDropPercent } = input;
  const uplift = CONFIG.scenarioUplift[scenario];
  const forecastFactor = uplift * (1 - salesDropPercent / 100);
  const base = baselineDaily(merchant);
  const history = new Map(merchant.dailyOrders.map((r) => [r.day, r]));

  // Day d <= 0 uses the real (simulated) order history; d > 0 uses the forecast.
  const prepaidOn = (d: number) => (d <= 0 ? history.get(d)?.prepaidValue ?? 0 : base.prepaid * forecastFactor);
  const codOn = (d: number) => (d <= 0 ? history.get(d)?.codValue ?? 0 : base.cod * forecastFactor);

  // Prepaid: an order placed on day d reaches the bank on day d + T.
  const T = merchant.settlementDays;
  let inTransit = 0;
  let forecastPrepaid = 0;
  let earnedNotSettled = 0;
  for (let d = -(T - 1); d <= byDay; d++) {
    const settlesOn = d + T;
    const value = prepaidOn(d);
    if (settlesOn > byDay) earnedNotSettled += value;
    else if (d <= 0) inTransit += value;
    else forecastPrepaid += value;
  }

  // COD: arrives 5-9 days after the order, and returned orders never pay out.
  let codGross = 0;
  for (let d = -merchant.codPayoutDelayDays.max; d <= byDay; d++) {
    codGross += codOn(d) * codArrivalShare(d, byDay, merchant.codPayoutDelayDays);
  }

  const cash: CashBreakdown = {
    bankBalance: round(merchant.bankBalance),
    settlementsInTransit: round(inTransit),
    forecastPrepaid: round(forecastPrepaid),
    codPayouts: round(codGross * (1 - merchant.codReturnRate)),
    totalIn: 0,
  };
  cash.totalIn = cash.bankBalance + cash.settlementsInTransit + cash.forecastPrepaid + cash.codPayouts;

  const invoiceDue = round(amountDueOn(invoice, byDay));
  const otherOutflows = round(merchant.otherOutflowsPerDay * byDay);
  const cashOut = invoiceDue + otherOutflows;
  const shortfall = cashOut - cash.totalIn;

  return {
    scenario,
    uplift,
    cash,
    earnedNotSettled: round(earnedNotSettled),
    invoiceDue,
    otherOutflows,
    cashOut,
    gap: Math.max(0, shortfall),
    surplus: Math.max(0, -shortfall),
  };
}

export function computeGap(input: GapInput): GapResult {
  const byDay = input.byDay ?? input.invoice.dueInDays;
  const salesDropPercent = Math.min(100, Math.max(0, input.salesDropPercent ?? 0));
  const args = { merchant: input.merchant, invoice: input.invoice, byDay, salesDropPercent };

  const scenarios = Object.fromEntries(
    SCENARIOS.map((s) => [s, computeScenario(s, args)]),
  ) as Record<Scenario, ScenarioResult>;

  const gapMin = scenarios.high.gap;
  const gapMax = scenarios.low.gap;
  const widthShare = (gapMax - gapMin) / input.invoice.amount;

  return {
    byDay,
    salesDropPercent,
    scenarios,
    gapMin,
    gapExpected: scenarios.expected.gap,
    gapMax,
    widthShare,
    lowConfidence: widthShare > CONFIG.lowConfidenceWidthShare,
  };
}
