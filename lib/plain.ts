// The words on the screens, built only from the engine's numbers. Plain TypeScript, no AI, no React.
// The copy follows Razorpay dashboard patterns: a label, a number, a short caption, and the detail in tables.
// The engine's names ("Instant settlement", "Bank overdraft") stay as they are in code.

import { merchant as simulatedMerchant, PREPAID_SHARE } from "./data/merchant";
import type { Invoice } from "./data/invoice";
import type { EngineResult, ViewId, ViewResult } from "./engine";
import type { OptionId } from "./engine/options";
import { CONFIG } from "./engine/config";
import { standbyFor } from "./engine/standby";
import { expectedLostMargin } from "./engine/stock";
import {
  formatDayMonth,
  formatLakh,
  formatLakh1,
  formatINR,
  formatPct,
} from "./format";
import { earlyPayDay } from "./journey";
import { SAVING_BASIS, outcomeForState } from "./results";

export { SAVING_BASIS };

// ---------- labels ----------

/** The rows of the funding table on the recommended plan. */
export const SOURCE_ROW: Record<OptionId, string> = {
  own_cash: "Your cash",
  bank_overdraft: "Your bank overdraft",
  credit_line: "Razorpay credit line",
  early_settlement: "Instant settlement",
  split_order: "Split the order",
};

/** Names in the options table. */
export const OPTION_LABEL: Record<OptionId, string> = {
  own_cash: "Your cash",
  bank_overdraft: "Bank overdraft",
  credit_line: "Razorpay credit line",
  early_settlement: "Instant settlement",
  split_order: "Split the order",
};

export const TERMS = {
  orderFewer: "Order fewer pairs",
} as const;

/** Fixed lines on the Plan screen. */
export const CLOSING_LINE =
  "Each loan is closed the day your sales money arrives.";
export const RATES_FOOTER =
  "Rates are illustrative. Your actual terms come from your Key Fact Statement.";
export const CREDIT_NEEDS_APPROVAL =
  "Razorpay credit needs lender approval and a final Key Fact Statement. Values shown are illustrative.";

/** "Shree Ganesh Footwear Pvt Ltd" -> "Shree Ganesh Footwear": the company form is noise in a caption. */
export function tidyName(name: string): string {
  return (
    name
      .replace(/\s+(pvt\.?\s*ltd\.?|private limited|limited|ltd\.?|llp)$/i, "")
      .trim() || name
  );
}

/** The date a day count falls on. Day 0 is the invoice's start date, or the demo's "today". */
export function dayLabel(invoice: Invoice, day: number): string {
  return formatDayMonth(invoice.startDate ?? simulatedMerchant.today, day);
}

const viewOf = (result: EngineResult, id: ViewId): ViewResult =>
  id === "right_sized" ? result.views.rightSized : result.views.keepFull;

// ---------- the one headline saving ----------

/** Money saved against paying on the due date the usual way, if sales come in as forecast. Plan and Results show this same number. */
export function forecastSaving(
  result: EngineResult,
  viewId: ViewId,
  state: {
    salesDropPercent: number;
    cashElsewhere: number;
    chosenView?: unknown;
  },
): number {
  // Pick the fields by name: a whole journey state also carries its own `chosenView` (null until chosen), which must not win.
  const { salesDropPercent, cashElsewhere } = state;
  return (
    outcomeForState(
      result,
      { chosenView: viewId, salesDropPercent, cashElsewhere },
      "as_forecast",
    )?.cost.moneySaved ?? 0
  );
}

/** "Order fewer pairs" gives the same plan as the full order: same pairs and same borrowing. */
export function fewerPairsSameAsFull(result: EngineResult): boolean {
  return (
    result.views.rightSized.units === result.views.keepFull.units &&
    result.views.rightSized.loan === result.views.keepFull.loan
  );
}

/**
 * The grey line about the backup: the credit line that is left unused if sales are slow, at no cost unless used.
 * When slow sales would leave the safety buffer uncovered it is a warning instead. Null if there is no credit left to mention.
 */
export function backupLine(
  view: ViewResult,
): { text: string; warn: boolean } | null {
  const sb = standbyFor(view);
  if (!sb.lowSalesCovered)
    return {
      text: `Backup: ${formatINR(sb.shortBy)} short if sales are slow.`,
      warn: true,
    };
  if (sb.unusedCredit <= 0) return null;
  return {
    text: `Backup: ${formatINR(sb.unusedCredit)} unused credit if sales are slow. No cost unless used.`,
    warn: false,
  };
}

// ---------- the recommended plan ----------

export interface HeroRow {
  id: OptionId;
  label: string;
  amount: number;
  /** Days the money is out. Null for your own cash. */
  days: number | null;
  /** The date it is repaid. Null for your own cash. */
  repaidBy: string | null;
  cost: number;
  share: number;
}

export interface HeroPlan {
  viewId: ViewId;
  /** "Pay by 21 Oct and get ₹10,000 off" */
  title: string;
  /** "₹9,583 better off than paying on the due date" */
  caption: string;
  rows: HeroRow[];
  totalCost: number;
  /** True if the plan borrows anything. */
  hasLoans: boolean;
  closingLine: string | null;
  backup: { text: string; warn: boolean } | null;
  footer: string;
  /** The headline saving against paying on the due date the usual way. */
  saving: number;
  payAmount: number;
  payDay: number;
  payDate: string;
  /** The amounts the Home mini-plan shows. */
  ownCash: number;
  overdraft: number;
  credit: number;
  instant: number;
  buffer: number;
}

export function buildHeroPlan(
  result: EngineResult,
  viewId: ViewId,
  saving: number,
): HeroPlan {
  const view = viewOf(result, viewId);
  const plan = view.recommended.plan;
  const early = view.recommended.timing === "pay_early_for_discount";
  const total = plan.steps.reduce((t, s) => t + s.amount, 0);
  const amountOf = (id: OptionId) =>
    plan.steps.find((s) => s.optionId === id)?.amount ?? 0;

  const rows: HeroRow[] = plan.steps.map((s) => ({
    id: s.optionId,
    label: SOURCE_ROW[s.optionId],
    amount: s.amount,
    days: s.days,
    repaidBy: s.closedDay === null ? null : dayLabel(view.invoice, s.closedDay),
    cost: s.cost,
    share: total > 0 ? s.amount / total : 0,
  }));
  const hasLoans = plan.steps.some((s) => s.isBorrowing);

  return {
    viewId,
    title: early
      ? `Pay by ${dayLabel(view.invoice, plan.payDay)} and get ${formatINR(view.discount.discountAmount)} off`
      : `Pay on ${dayLabel(view.invoice, plan.payDay)}`,
    caption: !plan.fullyCovered
      ? "Your limits do not cover this bill."
      : saving > 0
        ? `${formatINR(saving)} better off than paying on the due date`
        : saving === 0
          ? "Same cost as paying on the due date"
          : `${formatINR(-saving)} more than paying on the due date`,
    rows,
    totalCost: plan.totalCost,
    hasLoans,
    closingLine:
      hasLoans &&
      plan.fullyCovered &&
      plan.steps.every((x) => !x.isBorrowing || x.closedDay !== null)
        ? CLOSING_LINE
        : null,
    backup: backupLine(view),
    footer: RATES_FOOTER,
    saving,
    payAmount: plan.payAmount,
    payDay: plan.payDay,
    payDate: dayLabel(view.invoice, plan.payDay),
    ownCash: amountOf("own_cash"),
    overdraft: amountOf("bank_overdraft"),
    credit: amountOf("credit_line"),
    instant: amountOf("early_settlement"),
    buffer: plan.buffer,
  };
}

// ---------- Home ----------

export interface HomeAlert {
  title: string;
  line: string;
  /** "Your cash ₹A · Overdraft ₹B · Razorpay credit ₹C · Safety buffer kept ₹D", as separate parts. */
  mini: { label: string; value: number }[];
  saving: number;
  caption: string;
}

/** How long the money is out, in a few words: the days from the first draw to the day everything is repaid. */
export function aboutHowLong(view: ViewResult): string {
  const plan = view.recommended.plan;
  const firsts = Object.values(plan.sim.stats)
    .map((s) => s.firstDay)
    .filter((d): d is number => d !== null);
  if (firsts.length === 0 || plan.closedDay === null) return "a short while";
  const days = Math.max(1, plan.closedDay - Math.min(...firsts));
  if (days <= 10) return "about a week";
  if (days <= 17) return "about two weeks";
  return `about ${Math.round(days / 7)} weeks`;
}

export function homeAlert(result: EngineResult, saving: number): HomeAlert {
  const view = result.recommended;
  const plan = view.recommended.plan;
  const early = view.recommended.timing === "pay_early_for_discount";
  const hero = buildHeroPlan(result, result.recommendedView, saving);
  const gap = view.focusGap.gapExpected;
  const mini: HomeAlert["mini"] = [{ label: "Your cash", value: hero.ownCash }];
  if (hero.overdraft > 0)
    mini.push({ label: "Overdraft", value: hero.overdraft });
  if (hero.credit > 0)
    mini.push({ label: "Razorpay credit", value: hero.credit });
  if (hero.instant > 0)
    mini.push({ label: "Instant settlement", value: hero.instant });
  mini.push({ label: "Safety buffer kept", value: plan.buffer });
  const due = dayLabel(view.invoice, view.invoice.dueInDays);
  return {
    title: early
      ? `Save ${formatINR(view.discount.discountAmount)} on your supplier bill`
      : `Supplier bill due ${due}`,
    line: early
      ? `Pay by ${dayLabel(view.invoice, earlyPayDay(view.invoice))} instead of ${due}. ${gap > 0 ? `You'd need ${formatLakh1(gap)} for ${aboutHowLong(view)}.` : "You have the cash for it."}`
      : gap > 0
        ? `You'd need ${formatLakh1(gap)} for ${aboutHowLong(view)}.`
        : "You have enough cash to pay on the due date.",
    mini,
    saving,
    caption:
      saving > 0
        ? `${formatINR(saving)} better off`
        : saving === 0
          ? "Same cost as paying on the due date"
          : `${formatINR(-saving)} more than paying on the due date`,
  };
}

// ---------- the options table ----------

export interface CompareRow {
  id: string;
  label: string;
  covers: string;
  cost: string;
}

const DASH = "-";

/**
 * One row per way of finding the money, each tried alone with your own cash first: how much it can cover and what it
 * costs over the days it is used. Instant settlement says it is not needed when the plan does not use it.
 */
export function compareRows(
  result: EngineResult,
  viewId: ViewId,
): CompareRow[] {
  const view = viewOf(result, viewId);
  const usedInPlan = (id: OptionId) =>
    view.recommended.plan.steps.some((s) => s.optionId === id);
  const od = view.options.find((o) => o.id === "bank_overdraft");
  const rows: CompareRow[] = [];

  for (const o of view.options) {
    if (o.id === "split_order") {
      rows.push({
        id: o.id,
        label: OPTION_LABEL[o.id],
        covers: formatINR(o.maxAmount),
        cost: formatINR(o.stockOut?.expectedLostMargin ?? 0),
      });
      continue;
    }
    if (o.id === "early_settlement" && !usedInPlan("early_settlement")) {
      const overdraftCheaper =
        od?.solo && o.solo ? od.solo.cost <= o.solo.cost : false;
      rows.push({
        id: o.id,
        label: OPTION_LABEL[o.id],
        covers: overdraftCheaper
          ? "Not needed. Your overdraft is cheaper."
          : "Not needed.",
        cost: DASH,
      });
      continue;
    }
    rows.push({
      id: o.id,
      label: OPTION_LABEL[o.id],
      covers: o.solo ? formatINR(o.solo.covers) : DASH,
      cost: o.solo ? formatINR(o.solo.cost) : DASH,
    });
  }

  if (fewerPairsSameAsFull(result)) {
    rows.push({
      id: "order_fewer",
      label: TERMS.orderFewer,
      covers: "Not needed",
      cost: DASH,
    });
  } else {
    const lost = expectedLostMargin({
      orderUnits: result.stock.fullUnits,
      unitsNotOrdered: result.stock.unitsCut,
      demandUnits: result.stock.demandByScenario[result.stock.basis],
    }).expectedLostMargin;
    rows.push({
      id: "order_fewer",
      label: TERMS.orderFewer,
      covers: formatINR(result.stock.cashSaved),
      cost: formatINR(lost),
    });
  }
  return rows;
}

// ---------- Cash gap ----------

export type SourceLabel =
  "Connected banking" | "Store and courier data" | "Entered by you";

export interface GapView {
  headline: string;
  hero: string;
  caption: string;
  /** "Forecast" label and how sure it is. */
  forecastLabel: string;
  confidence: string;
  lowConfidence: boolean;
  /** "Paying on 10 Nov needs no borrowing." Null if the due date needs borrowing too. */
  dueLine: string | null;
  summary: { label: string; value: string; caption?: string }[];
  /** "How we estimated this": each estimate with where its data comes from. All simulated. */
  estimates: { label: string; value: string; source: SourceLabel }[];
}

export function gapView(result: EngineResult): GapView {
  const view = result.recommended;
  const gap = view.focusGap;
  const e = gap.scenarios.expected;
  const early = view.recommended.timing === "pay_early_for_discount";
  const lastDay = early ? earlyPayDay(view.invoice) : view.invoice.dueInDays;
  const m = simulatedMerchant;
  return {
    headline:
      gap.gapExpected <= 0
        ? "You have enough cash"
        : early
          ? `To pay early, you'd be ${formatLakh1(gap.gapExpected)} short for ${aboutHowLong(view)}.`
          : `You're likely ${formatLakh1(gap.gapExpected)} short on ${dayLabel(view.invoice, view.invoice.dueInDays)}.`,
    hero: formatINR(gap.gapExpected),
    caption:
      gap.gapMax === 0
        ? "Enough cash in every case"
        : `${early ? "Range for paying early" : "Likely range"} ${formatINR(gap.gapMin)} to ${formatINR(gap.gapMax)}`,
    dueLine:
      early && view.gap.gapExpected === 0
        ? `Paying on ${dayLabel(view.invoice, view.invoice.dueInDays)} needs no borrowing.`
        : null,
    forecastLabel: "Forecast",
    confidence: gap.lowConfidence
      ? "Low confidence: wide range"
      : "Medium confidence: narrow range",
    lowConfidence: gap.lowConfidence,
    summary: [
      { label: "Cash coming in", value: formatINR(e.cash.totalIn) },
      { label: "Cash going out", value: formatINR(e.cashOut) },
      {
        label: "Timing",
        value: early
          ? `Discount ends ${dayLabel(view.invoice, lastDay)}`
          : `Bill due ${dayLabel(view.invoice, view.invoice.dueInDays)}`,
        caption: early
          ? `Bill due ${dayLabel(view.invoice, view.invoice.dueInDays)}`
          : undefined,
      },
    ],
    estimates: [
      {
        label: "Festive uplift",
        value: `${CONFIG.scenarioUplift.expected}x normal sales`,
        source: "Store and courier data",
      },
      {
        label: "COD share",
        value: formatPct((1 - PREPAID_SHARE) * 100),
        source: "Store and courier data",
      },
      {
        label: "COD timing",
        value: `${m.codPayoutDelayDays.min} to ${m.codPayoutDelayDays.max} days after order`,
        source: "Store and courier data",
      },
      {
        label: "Returns",
        value: `${formatPct(m.codReturnRate * 100)} of COD orders`,
        source: "Store and courier data",
      },
      {
        label: "Settlement timing",
        value: `${m.settlementDays} days after sale`,
        source: "Connected banking",
      },
    ],
  };
}

// ---------- Bill ----------

export const LATE_FEE_LAW =
  "If your supplier is a registered micro/small enterprise, the law sets late interest at 3x the RBI bank rate, compounded monthly.";
export const BILL_PRIVACY =
  "We don't save your bill. It is sent to our AI provider only to read it.";

const num = (s: string) => Number(s.replace(/[,₹\s]/g, ""));

/** The early-payment opportunity from the bill's fields as typed. Null if the fields do not give one. */
export function billHero(values: {
  totalAmount: string;
  invoiceDate: string;
  dueDate: string;
  earlyPaymentDiscountPercent: string;
  earlyPaymentDiscountDays: string;
}): { hero: string; caption: string } | null {
  const amount = num(values.totalAmount);
  const pct = num(values.earlyPaymentDiscountPercent);
  const days = num(values.earlyPaymentDiscountDays);
  if (
    !(amount > 0) ||
    !(pct > 0) ||
    !(days > 0) ||
    !values.invoiceDate ||
    !values.dueDate
  )
    return null;
  const off = Math.round((amount * pct) / 100);
  return {
    hero: `${formatINR(off)} off`,
    caption: `Pay ${formatLakh(amount - off)} by ${formatDayMonth(values.invoiceDate, days)} instead of ${formatLakh(amount)} by ${formatDayMonth(values.dueDate, 0)}.`,
  };
}

// ---------- How we worked this out: the plan, day by day ----------

export interface DayRow {
  date: string;
  overdraft: number;
  credit: number;
  /** Interest added that day, in rupees with paise: ₹0.01 matters when a loan is out for days. */
  interest: string;
}

const paise = (n: number) => `₹${n.toFixed(2)}`;

/** One row per day something is owed: the two balances and the interest that day, so the total cost can be traced. */
export function dayByDay(
  result: EngineResult,
  viewId: ViewId,
): { rows: DayRow[]; total: string } {
  const view = viewOf(result, viewId);
  const sim = view.recommended.plan.sim;
  const od = sim.loanByDay.bank_overdraft;
  const cl = sim.loanByDay.credit_line;
  const rows: DayRow[] = [];
  for (let t = 0; t < od.balance.length; t++) {
    if (od.balance[t] < 0.5 && cl.balance[t] < 0.5) continue;
    rows.push({
      date: dayLabel(view.invoice, t),
      overdraft: Math.round(od.balance[t]),
      credit: Math.round(cl.balance[t]),
      interest: paise(od.interest[t] + cl.interest[t]),
    });
  }
  return { rows, total: formatINR(view.recommended.plan.totalCost) };
}
