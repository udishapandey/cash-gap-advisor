// The words on the screens, built only from the engine's numbers. Plain TypeScript, no AI, no React.
// The copy follows Razorpay dashboard patterns: a label, a number, a short caption, and the detail in tables.
// The engine's names ("Early settlement", "Bank overdraft", "Peak shortfall") stay as they are in code.

import { merchant as simulatedMerchant } from "./data/merchant";
import type { Invoice } from "./data/invoice";
import type { EngineResult, ViewId, ViewResult } from "./engine";
import type { OptionId } from "./engine/options";
import { standbyFor } from "./engine/standby";
import { expectedLostMargin } from "./engine/stock";
import { formatDayMonth, formatINR, formatPct } from "./format";
import { daysOut, earlyPayDay, earlySettlementWhy, quoteOption, tenureDays } from "./journey";
import { SAVING_BASIS, outcomeForState } from "./results";

export { SAVING_BASIS };

// ---------- labels ----------

/** The rows of the funding table on the recommended plan. */
export const SOURCE_ROW: Record<OptionId, string> = {
  early_settlement: "Settle your sales early",
  bank_overdraft: "Your bank overdraft",
  credit_line: "Razorpay credit line",
  split_order: "Split the order",
};

/** Names in the "All options" table, and anywhere a plain name of an option is needed. */
export const OPTION_LABEL: Record<OptionId, string> = {
  early_settlement: "Settle sales early",
  bank_overdraft: "Bank overdraft",
  credit_line: "Razorpay credit line",
  split_order: "Split the order",
};

export const TERMS = {
  orderFewer: "Order fewer pairs",
  standby: "Backup",
} as const;

/** "Shree Ganesh Footwear Pvt Ltd" -> "Shree Ganesh Footwear": the company form is noise in a caption. */
export function tidyName(name: string): string {
  return name.replace(/\s+(pvt\.?\s*ltd\.?|private limited|limited|ltd\.?|llp)$/i, "").trim() || name;
}

/** The date a day count falls on. Day 0 is the invoice's start date, or the demo's "today". */
export function dayLabel(invoice: Invoice, day: number): string {
  return formatDayMonth(invoice.startDate ?? simulatedMerchant.today, day);
}

const viewOf = (result: EngineResult, id: ViewId): ViewResult => (id === "right_sized" ? result.views.rightSized : result.views.keepFull);
const planOptionsOf = (view: ViewResult) => (view.recommended.timing === "pay_early_for_discount" ? view.earlyOptions : view.options);

// ---------- the one headline saving ----------

/** Money saved against the usual way, if sales come in as forecast. Options and Results show this same number. */
export function forecastSaving(
  result: EngineResult,
  viewId: ViewId,
  state: { salesDropPercent: number; cashElsewhere: number; chosenView?: unknown },
): number {
  // Pick the fields by name: a whole journey state also carries its own `chosenView` (null until chosen), which must not win.
  const { salesDropPercent, cashElsewhere } = state;
  return outcomeForState(result, { chosenView: viewId, salesDropPercent, cashElsewhere }, "as_forecast")?.cost.moneySaved ?? 0;
}

/** "Order fewer pairs" gives the same plan as the full order: same pairs and same borrowing. */
export function fewerPairsSameAsFull(result: EngineResult): boolean {
  return result.views.rightSized.units === result.views.keepFull.units && result.views.rightSized.loan === result.views.keepFull.loan;
}

/**
 * The grey line about the backup (the engine calls it standby): the most that could be needed if sales are slow, and
 * that your unused credit line covers it. When the unused credit line falls short it is a warning instead. Null if no backup is needed.
 */
export function backupLine(view: ViewResult): { text: string; warn: boolean } | null {
  const sb = standbyFor(view);
  if (sb.amount === 0) return null;
  return sb.coveredByHeadroom
    ? { text: `Backup ${formatINR(sb.amount)} on your credit line if sales are slow. No cost unless used.`, warn: false }
    : { text: `Backup ${formatINR(sb.amount)} needs ${formatINR(sb.shortBy)} more credit.`, warn: true };
}

// ---------- the recommended plan ----------

export interface HeroRow {
  id: OptionId;
  label: string;
  amount: number;
  /** Days the money is out. Null where that does not apply. */
  days: number | null;
  cost: number;
  share: number;
}

export interface HeroPlan {
  viewId: ViewId;
  /** "Pay by 18 Oct and get ₹10,000 off" */
  title: string;
  /** "₹11,310 better off than borrowing the usual way" */
  caption: string;
  /** Only when the order is cut: "Order 364 of 500 pairs". */
  orderChip: string | null;
  rows: HeroRow[];
  totalCost: number;
  /** Green chip: only when getting the sales money early is the cheapest source. */
  insight: string | null;
  /** Grey line about the backup, or a warning when the unused credit limit cannot cover it. */
  backup: { text: string; warn: boolean } | null;
  noBorrowing: boolean;
  /** The headline saving against the usual way. */
  saving: number;
}

export function buildHeroPlan(result: EngineResult, viewId: ViewId, saving: number): HeroPlan {
  const view = viewOf(result, viewId);
  const plan = view.recommended.plan;
  const early = view.recommended.timing === "pay_early_for_discount";
  const planOptions = planOptionsOf(view);
  const loanDays = tenureDays(view);
  const settlementDays = simulatedMerchant.settlementDays;
  const payDay = early ? earlyPayDay(view.invoice) : view.invoice.dueInDays;

  const rows: HeroRow[] = plan.steps.map((s) => {
    const option = planOptions.find((o) => o.id === s.optionId)!;
    return {
      id: s.optionId,
      label: SOURCE_ROW[s.optionId],
      amount: s.amount,
      days: daysOut(option, settlementDays, loanDays),
      cost: s.cost,
      share: plan.covered > 0 ? s.amount / plan.covered : 0,
    };
  });

  const earlyStep = plan.steps.find((s) => s.optionId === "early_settlement");
  const cheapest = earlyStep ? earlySettlementWhy({ options: planOptions, amount: earlyStep.amount, settlementDays, loanDays }) : null;

  return {
    viewId,
    title: early ? `Pay by ${dayLabel(view.invoice, payDay)} and get ${formatINR(view.discount.discountAmount)} off` : `Pay on ${dayLabel(view.invoice, payDay)}`,
    caption:
      saving > 0
        ? `${formatINR(saving)} better off than borrowing the usual way`
        : saving === 0
          ? "Same cost as borrowing the usual way"
          : `${formatINR(-saving)} more than borrowing the usual way`,
    orderChip: view.units < result.stock.fullUnits ? `Order ${view.units} of ${result.stock.fullUnits} pairs` : null,
    rows,
    totalCost: plan.totalCost,
    insight: earlyStep && cheapest ? `Early settlement is costly per year, but you need it for only ${settlementDays} days.` : null,
    backup: backupLine(view),
    noBorrowing: rows.length === 0,
    saving,
  };
}

// ---------- the "All options" table ----------

export interface CompareRow {
  id: string;
  label: string;
  covers: string;
  cost: string;
  yearly: string;
}

const DASH = "-";

/**
 * One row per way of finding the money, on the same footing: priced for the plan's own worst point, and loans for the
 * plan's own number of days, so the table agrees with the plan.
 */
export function compareRows(result: EngineResult, viewId: ViewId): CompareRow[] {
  const view = viewOf(result, viewId);
  const options = planOptionsOf(view);
  const gap = view.recommended.plan.gap;
  const rows: CompareRow[] = options.map((o) => {
    const q = quoteOption(o, gap);
    return {
      id: o.id,
      label: OPTION_LABEL[o.id],
      covers: q.available ? formatINR(q.covers) : "None",
      cost: q.available ? formatINR(q.cost) : DASH,
      yearly: o.annualisedPct === null ? DASH : formatPct(o.annualisedPct),
    };
  });

  if (fewerPairsSameAsFull(result)) {
    rows.push({ id: "order_fewer", label: TERMS.orderFewer, covers: "Not needed", cost: DASH, yearly: DASH });
  } else {
    const lost = expectedLostMargin({
      orderUnits: result.stock.fullUnits,
      unitsNotOrdered: result.stock.unitsCut,
      demandUnits: result.stock.demandByScenario[result.stock.basis],
    }).expectedLostMargin;
    rows.push({ id: "order_fewer", label: TERMS.orderFewer, covers: formatINR(result.stock.cashSaved), cost: formatINR(lost), yearly: DASH });
  }

  const d = view.discount;
  rows.push({
    id: "pay_early",
    label: "Pay early for discount",
    covers: d.discountAmount > 0 && d.affordable ? formatINR(d.discountAmount) : "None",
    cost: d.discountAmount > 0 && d.affordable ? formatINR(Math.max(0, d.extraFundingCost)) : DASH,
    yearly: DASH,
  });
  return rows;
}
