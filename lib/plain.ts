// Plain-language wording for the screens, built only from the engine's numbers. Plain TypeScript, no AI, no React.
// The engine's names ("Early settlement", "Bank overdraft", "Peak shortfall"...) stay as they are in code: they are
// translated here, for the founder, who is not a finance person.

import { merchant as simulatedMerchant } from "./data/merchant";
import type { EngineResult, ViewId, ViewResult } from "./engine";
import type { OptionId } from "./engine/options";
import { formatCompactINR, formatINR, formatPct } from "./format";
import { daysOut, earlyPayDay, earlySettlementWhy, quoteOption, tenureDays } from "./journey";
import { SAVING_BASIS, outcomeForState } from "./results";
import { expectedLostMargin } from "./engine/stock";

// ---------- labels ----------

/** What each funding source is called on screen. */
export const OPTION_LABEL: Record<OptionId, string> = {
  early_settlement: "Get your Razorpay sales money early",
  credit_line: "Razorpay credit line",
  bank_overdraft: "Your bank's overdraft",
  split_order: "Deliver some pairs later",
};

/** The same, short enough for a legend under a bar. */
export const OPTION_SHORT: Record<OptionId, string> = {
  early_settlement: "Razorpay sales money, early",
  credit_line: "Razorpay credit line",
  bank_overdraft: "Your bank's overdraft",
  split_order: "Pairs delivered later",
};

/** Other renamed terms. */
export const TERMS = {
  peakShortfall: "Most you'll be short on any day",
  fundingCost: "Total interest and fees",
  orderFewer: "Order fewer pairs",
  standby: "Backup if sales are slow",
  yearlyRate: "Yearly rate (for comparison only)",
} as const;

// ---------- the recommended plan, as the founder reads it ----------

const viewOf = (result: EngineResult, id: ViewId): ViewResult => (id === "right_sized" ? result.views.rightSized : result.views.keepFull);
const planOptionsOf = (view: ViewResult) => (view.recommended.timing === "pay_early_for_discount" ? view.earlyOptions : view.options);

/** The one headline saving: money saved against the default, if sales come in as forecast. Same basis as the Results screen. */
export function forecastSaving(
  result: EngineResult,
  viewId: ViewId,
  state: { salesDropPercent: number; cashElsewhere: number; chosenView?: unknown },
): number {
  // Pick the fields by name: a whole journey state also carries its own `chosenView` (null until chosen), which must not win.
  const { salesDropPercent, cashElsewhere } = state;
  return outcomeForState(result, { chosenView: viewId, salesDropPercent, cashElsewhere }, "as_forecast")?.cost.moneySaved ?? 0;
}

/** "Ordering fewer pairs" gives the same plan as the full order: same pairs and same loan. */
export function fewerPairsSameAsFull(result: EngineResult): boolean {
  return result.views.rightSized.units === result.views.keepFull.units && result.views.rightSized.loan === result.views.keepFull.loan;
}

export const FEWER_PAIRS_NO_HELP = (units: number) => `Ordering fewer pairs wouldn't help: the forecast says all ${units} sell.`;

export { SAVING_BASIS };

export interface HeroPlan {
  viewId: ViewId;
  /** "You're short about ₹2.28L for a few days." */
  shortLine: string;
  /** Why the amount to cover is bigger than the shortfall on the due date, when paying early for the discount. */
  coverNote: string | null;
  coverIntro: string;
  steps: { id: OptionId; label: string; amount: number; share: number }[];
  total: number;
  /** The key insight, when getting the sales money early is the cheapest source. */
  insight: string | null;
  payLine: string;
  /** The single headline saving, against the usual way. */
  saving: number;
  basis: string;
  /** Pairs and the one line about ordering fewer. */
  fewerPairsNote: string | null;
}

export function buildHeroPlan(result: EngineResult, viewId: ViewId, saving: number): HeroPlan {
  const view = viewOf(result, viewId);
  const plan = view.recommended.plan;
  const early = view.recommended.timing === "pay_early_for_discount";
  const planOptions = planOptionsOf(view);
  const loanDays = tenureDays(view);
  const settlementDays = simulatedMerchant.settlementDays;
  const payDay = early ? earlyPayDay(view.invoice) : view.invoice.dueInDays;
  const gapOnDueDate = view.gap.gapExpected;

  const steps = plan.steps.map((s) => ({
    id: s.optionId,
    label: OPTION_SHORT[s.optionId],
    amount: s.amount,
    share: plan.covered > 0 ? s.amount / plan.covered : 0,
  }));

  const earlyStep = plan.steps.find((s) => s.optionId === "early_settlement");
  const why = earlyStep ? earlySettlementWhy({ options: planOptions, amount: earlyStep.amount, settlementDays, loanDays }) : null;
  const insight =
    earlyStep && why
      ? `Getting your sales money ${settlementDays} days early looks expensive per year, but costs only ${formatINR(earlyStep.cost)}: you need it for just ${settlementDays} days. Compare rupees, not yearly rates.`
      : null;

  const coverNote =
    plan.gap > gapOnDueDate && early
      ? `Paying on day ${payDay} for the discount means needing ${formatCompactINR(plan.gap)} at the worst point, ${view.invoice.dueInDays - payDay} days sooner.`
      : null;

  const coverIntro =
    steps.length === 0
      ? "You don't need to borrow: your cash covers it."
      : steps.length === 1
        ? "Cover it like this:"
        : "Don't take one big loan. Cover it in this order:";

  const discount = view.discount.discountAmount;
  let payLine: string;
  if (early) {
    payLine =
      saving > 0
        ? `Pay the supplier by day ${payDay} → you get ${formatINR(discount)} off. After all interest and fees, you're ${formatINR(saving)} better off.`
        : `Pay the supplier by day ${payDay} → you get ${formatINR(discount)} off, which about covers the interest and fees.`;
  } else if (saving > 0) {
    payLine = `Pay the supplier on the due date (day ${payDay}). Interest and fees are ${formatINR(saving)} less than the usual way.`;
  } else if (saving < 0) {
    payLine = `Pay the supplier on the due date (day ${payDay}). Interest and fees are ${formatINR(-saving)} more than the usual way.`;
  } else {
    payLine = `Pay the supplier on the due date (day ${payDay}). Interest and fees match the usual way.`;
  }

  return {
    viewId,
    shortLine: `You're short about ${formatCompactINR(gapOnDueDate)} for a few days.`,
    coverNote,
    coverIntro,
    steps,
    total: plan.covered,
    insight,
    payLine,
    saving,
    basis: SAVING_BASIS,
    fewerPairsNote: fewerPairsSameAsFull(result) ? FEWER_PAIRS_NO_HELP(result.stock.fullUnits) : null,
  };
}

// ---------- the "compare every option" table ----------

export interface CompareRow {
  id: string;
  label: string;
  covers: string;
  cost: string;
  yearly: string;
  days: string;
  available: boolean;
}

/**
 * One row per way of finding the money, all on the same footing: priced for the plan's own worst point, and loans for the
 * plan's own number of days, so the table agrees with the plan.
 */
export function compareRows(result: EngineResult, viewId: ViewId): CompareRow[] {
  const view = viewOf(result, viewId);
  const options = planOptionsOf(view);
  const loanDays = tenureDays(view);
  const gap = view.recommended.plan.gap;
  const rows: CompareRow[] = options.map((o) => {
    const q = quoteOption(o, gap);
    const days = daysOut(o, simulatedMerchant.settlementDays, loanDays);
    return {
      id: o.id,
      label: OPTION_LABEL[o.id],
      covers: q.available ? formatINR(q.covers) : "none available",
      cost: q.available ? (o.id === "split_order" ? `${formatINR(q.cost)} lost profit` : formatINR(q.cost)) : "n/a",
      yearly: o.annualisedPct === null ? "n/a" : formatPct(o.annualisedPct),
      days: days === null ? "n/a" : String(days),
      available: q.available,
    };
  });

  if (!fewerPairsSameAsFull(result)) {
    const lost = expectedLostMargin({
      orderUnits: result.stock.fullUnits,
      unitsNotOrdered: result.stock.unitsCut,
      demandUnits: result.stock.demandByScenario[result.stock.basis],
    }).expectedLostMargin;
    rows.push({
      id: "order_fewer",
      label: TERMS.orderFewer,
      covers: `${formatINR(result.stock.cashSaved)} less to pay`,
      cost: `${formatINR(lost)} lost profit`,
      yearly: "n/a",
      days: "n/a",
      available: result.stock.unitsCut > 0,
    });
  }

  const d = view.discount;
  rows.push({
    id: "pay_early",
    label: "Pay early for the discount",
    covers: `${formatINR(d.discountAmount)} off`,
    cost: d.extraFundingCost >= 0 ? `${formatINR(d.extraFundingCost)} more in interest` : `${formatINR(-d.extraFundingCost)} less in interest`,
    yearly: "n/a",
    days: `${d.daysEarly} days early`,
    available: d.discountAmount > 0 && d.affordable,
  });
  return rows;
}

/** The days, explained once. */
export function daysFootnote(view: ViewResult): string {
  const loanDays = tenureDays(view);
  const settle = simulatedMerchant.settlementDays;
  const early = view.recommended.timing === "pay_early_for_discount";
  const extra = loanDays - 30;
  return `Your Razorpay sales money only comes ${settle} days early, so it is out for ${settle} days. A loan is out for ${loanDays} days${early ? ` (30, plus ${extra} because paying early needs the cash sooner)` : ""}. The discount line is measured against paying on the due date.`;
}

// ---------- costs without a minus sign ----------

/** Interest and fees for a plan that also earned a discount. A cost is never shown as negative. */
export function interestAndFeesLine(fundsCost: number, discount: number): string {
  if (discount > fundsCost) return `The discount more than covers the interest by ${formatINR(discount - fundsCost)}.`;
  return `Total interest and fees: ${formatINR(fundsCost - discount)} after the discount.`;
}
