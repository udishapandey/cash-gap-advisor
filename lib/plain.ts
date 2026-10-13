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
  formatINR,
  formatPct,
  inrShort,
} from "./format";
import { earlyPayDay } from "./journey";
import { canChooseDueDate, pickPlan, type PlanChoice } from "./plan-choice";
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
  "Loans are repaid as sales money arrives.";
export const RATES_FOOTER =
  "Rates are illustrative. Final terms are in your Key Fact Statement.";
export const CREDIT_NEEDS_APPROVAL =
  "Razorpay credit is subject to eligibility and final lender terms. Values are illustrative.";

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
    planChoice?: PlanChoice;
  },
): number {
  // Pick the fields by name: a whole journey state also carries its own `chosenView` (null until chosen), which must not win.
  const { salesDropPercent, cashElsewhere, planChoice } = state;
  return (
    outcomeForState(
      result,
      { chosenView: viewId, salesDropPercent, cashElsewhere, planChoice },
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
      text: `Backup credit is ${formatINR(sb.shortBy)} short if sales are slow.`,
      warn: true,
    };
  if (sb.unusedCredit <= 0) return null;
  return {
    text: `Backup credit ${formatINR(sb.unusedCredit)} unused. No cost unless used.`,
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
  /** "Pay ₹4.90L by 21 Oct to get the ₹10,000 discount." Null when the plan pays on the due date. */
  subtitle: string | null;
  /** The supplier discount the plan takes, in rupees. Zero when it pays on the due date. */
  discount: number;
  /** "₹9,583 better off than paying on the due date" */
  caption: string;
  /** False when the limits cannot cover the bill: the screen then shows the options below instead of a cost table. */
  covered: boolean;
  /** One plain line on why the plan pays on the due date although there is a discount. Null otherwise. */
  reason: string | null;
  /** What the founder can do when the limits do not cover the bill. */
  uncoveredOptions: string[];
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

export const UNCOVERED_TITLE = "Your limits don't cover this bill";
const UNCOVERED_OPTIONS = ["Ask the supplier for more days", "Pay part now, the rest on {due}", "Ask your lender for a higher limit"];

/** Why the plan pays on the due date when a discount was on offer. Null if it pays early, or there is no discount. */
export function payEarlyReason(view: ViewResult): string | null {
  if (view.recommended.timing === "pay_early_for_discount" || view.discount.discountAmount <= 0) return null;
  const early = view.earlyPlan;
  if (!early.fullyCovered) return "Limits can't cover paying early.";
  if (!early.simLow.feasible) return "Paying early would leave you short if sales are low.";
  return "Interest would exceed the discount.";
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
      ? `Pay early and keep ${formatINR(Math.max(0, saving))}`
      : `Pay on ${dayLabel(view.invoice, plan.payDay)}`,
    subtitle: early
      ? `Pay ${formatLakh(plan.payAmount)} by ${dayLabel(view.invoice, plan.payDay)} to get the ${formatINR(view.discount.discountAmount)} discount.`
      : null,
    discount: early ? view.discount.discountAmount : 0,
    covered: plan.fullyCovered,
    reason: payEarlyReason(view),
    uncoveredOptions: UNCOVERED_OPTIONS.map((o) => o.replace("{due}", dayLabel(view.invoice, view.invoice.dueInDays))),
    caption: !plan.fullyCovered
      ? "Limits don't cover this bill."
      : saving > 0
        ? `Net benefit ${formatINR(saving)}`
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
  /** "₹10,000 discount − ₹417 interest". Null when the plan takes no discount. */
  breakdown: string | null;
  line: string;
  /** The facts under the title: the bill, the cash needed and the cost of financing. */
  facts: { label: string; value: string; caption?: string }[];
  /** "Your cash ₹A · Overdraft ₹B · Razorpay credit ₹C · Safety buffer kept ₹D", as separate parts. */
  mini: { id: OptionId; label: string; value: number }[];
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

/** The days the money is out: from the first draw to the day everything is repaid. Null if nothing is borrowed. */
export function daysOut(view: ViewResult): number | null {
  const plan = view.recommended.plan;
  const firsts = Object.values(plan.sim.stats)
    .map((s) => s.firstDay)
    .filter((d): d is number => d !== null);
  if (firsts.length === 0 || plan.closedDay === null) return null;
  return Math.max(1, plan.closedDay - Math.min(...firsts));
}

export function homeAlert(result: EngineResult, saving: number): HomeAlert {
  const view = result.recommended;
  const plan = view.recommended.plan;
  const early = view.recommended.timing === "pay_early_for_discount";
  const hero = buildHeroPlan(result, result.recommendedView, saving);
  const gap = view.focusGap.gapExpected;
  const days = daysOut(view);
  const mini: HomeAlert["mini"] = [{ id: "own_cash", label: "Cash", value: hero.ownCash }];
  if (hero.overdraft > 0) mini.push({ id: "bank_overdraft", label: "Overdraft", value: hero.overdraft });
  if (hero.credit > 0) mini.push({ id: "credit_line", label: "Razorpay credit", value: hero.credit });
  if (hero.instant > 0) mini.push({ id: "early_settlement", label: "Instant settlement", value: hero.instant });
  const due = dayLabel(view.invoice, view.invoice.dueInDays);
  const supplier = tidyName(view.invoice.supplier);
  return {
    // The headline is what the founder keeps: the discount less the interest, with both shown under it.
    title: early ? `Save ${formatINR(saving > 0 ? saving : view.discount.discountAmount)}` : `Bill due ${due}`,
    breakdown: early && saving > 0 ? `${formatINR(view.discount.discountAmount)} discount − ${formatINR(plan.totalCost)} interest` : null,
    line: early ? `Pay ${supplier} by ${dayLabel(view.invoice, earlyPayDay(view.invoice))}` : supplier,
    facts: [
      { label: "Bill", value: inrShort(view.invoice.amount), caption: `Due ${due}` },
      gap > 0
        ? { label: "Cash needed", value: inrShort(gap), caption: days ? `for ${days} days` : undefined }
        : { label: "Cash needed", value: "None" },
      { label: "Financing cost", value: formatINR(plan.totalCost) },
    ],
    mini,
    saving,
    caption: saving > 0 ? `${formatINR(saving)}` : saving === 0 ? "Same cost as paying on the due date" : `${formatINR(-saving)} more than paying on the due date`,
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
        covers: overdraftCheaper && view.recommended.plan.steps.some((s) => s.isBorrowing)
          ? "Not needed. Overdraft costs less."
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
  /** "for 8 days" or "on 10 Nov": what goes under the shortfall figure. */
  duration: string | null;
  /** "Includes ₹50,000 safety buffer". */
  bufferLine: string;
  /** "How we estimated this": each estimate with where its data comes from. All simulated. */
  estimates: { label: string; value: string; source: SourceLabel }[];
}

export const ESTIMATE_LINE = "This estimate combines expected sales, settlements, COD cash and upcoming outflows.";

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
        ? "No cash shortfall"
        : early
          ? `To pay early, you'd be ${inrShort(gap.gapExpected)} short for ${aboutHowLong(view)}.`
          : `You're likely ${inrShort(gap.gapExpected)} short on ${dayLabel(view.invoice, view.invoice.dueInDays)}.`,
    hero: inrShort(gap.gapExpected),
    bufferLine: `Includes ${formatINR(view.recommended.plan.buffer)} safety buffer`,
    duration: gap.gapExpected <= 0 ? null : early ? `for ${daysOut(view) ?? "a few"} days` : `on ${dayLabel(view.invoice, view.invoice.dueInDays)}`,
    caption:
      gap.gapMax === 0
        ? "Enough cash in every case"
        : `Range ${formatINR(gap.gapMin)} to ${formatINR(gap.gapMax)}`,
    dueLine:
      early && view.gap.gapExpected === 0
        ? `Paying on ${dayLabel(view.invoice, view.invoice.dueInDays)} needs no borrowing.`
        : null,
    forecastLabel: "Forecast",
    confidence: gap.lowConfidence ? "Low confidence" : "Medium confidence",
    lowConfidence: gap.lowConfidence,
    summary: [
      { label: "Cash available", value: inrShort(e.cash.totalIn) },
      { label: "Cash going out", value: inrShort(e.cashOut) },
      {
        label: early ? "Discount deadline" : "Due date",
        value: dayLabel(view.invoice, lastDay),
        caption: early ? `Bill due ${dayLabel(view.invoice, view.invoice.dueInDays)}` : undefined,
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
  "Registered micro and small suppliers can charge late interest of 3x the RBI bank rate, compounded monthly.";
export const BILL_PRIVACY =
  "We don't store your bill. It is shared with our AI provider only to read it.";

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
    hero: `Save ${formatINR(off)}`,
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

// ---------- The plan choice ----------

export interface PlanCard {
  choice: PlanChoice;
  recommended: boolean;
  /** "Pay on 21 Oct" */
  title: string;
  discount: string;
  borrowing: string;
  cost: string;
  net: string;
}

export const CHOICE_LINE = "You decide. You can also change any number above and the plan updates.";
export const SINGLE_CHOICE_LINE = "You can change any number above and the plan updates.";

/**
 * The plans the founder can pick between: the recommended one and, when the recommendation pays early, paying on the due
 * date. One card when there is no real alternative. Every figure is the engine's own for that plan.
 */
export function planChoiceCards(result: EngineResult, state: { salesDropPercent: number; cashElsewhere: number }): PlanCard[] {
  const choices: PlanChoice[] = canChooseDueDate(result.recommended) ? ["recommended", "due_date"] : ["recommended"];
  return choices.map((choice) => {
    const view = pickPlan(result.recommended, choice);
    const plan = view.recommended.plan;
    const early = view.recommended.timing === "pay_early_for_discount";
    const days = daysOut(view);
    const saving = forecastSaving(result, result.recommendedView, { ...state, planChoice: choice });
    return {
      choice,
      recommended: choice === "recommended",
      title: `Pay on ${dayLabel(view.invoice, plan.payDay)}`,
      discount: early ? `${formatINR(view.discount.discountAmount)} off` : "No discount",
      borrowing: plan.borrowed > 0 ? `${inrShort(plan.borrowed)} for ${days ?? "a few"} days` : "No borrowing",
      cost: formatINR(plan.totalCost),
      net: formatINR(Math.max(0, saving)),
    };
  });
}

// ---------- Who does what, and when ----------

export const CANCEL_NOTE = "Payment cancelled. Nothing was paid or borrowed.";

/** The first day a source was drawn, as a date. Falls back to the payment day. */
function drawDate(view: ViewResult, id: "credit_line" | "bank_overdraft" | "early_settlement"): string {
  const plan = view.recommended.plan;
  return dayLabel(view.invoice, plan.sim.stats[id].firstDay ?? plan.payDay);
}

/**
 * Approve: what Razorpay will do and what the founder has to do, only for the steps of the plan on offer.
 * "You'll need to do" is empty when the plan needs nothing from the founder.
 */
export function whoDoesWhat(view: ViewResult): { razorpay: string[]; you: string[] } {
  const plan = view.recommended.plan;
  const step = (id: string) => plan.steps.find((s) => s.optionId === id);
  const razorpay: string[] = [];
  const you: string[] = [];
  const credit = step("credit_line");
  const instant = step("early_settlement");
  const overdraft = step("bank_overdraft");
  if (credit) razorpay.push(`Draw ${inrShort(credit.amount)} from your Razorpay credit line on ${drawDate(view, "credit_line")}`);
  if (instant) razorpay.push(`Settle ${inrShort(instant.amount)} of your sales early on ${drawDate(view, "early_settlement")}`);
  razorpay.push(`Pay ${tidyName(view.invoice.supplier)} ${inrShort(plan.payAmount)} on ${dayLabel(view.invoice, plan.payDay)}`);
  if (overdraft) you.push(`Move ${inrShort(overdraft.amount)} from your bank overdraft into your RazorpayX account by ${drawDate(view, "bank_overdraft")}`);
  return { razorpay, you };
}

/** True while the payment date is still ahead: the founder can cancel. Day 0 is today. */
export function paymentIsScheduled(view: ViewResult): boolean {
  return view.recommended.plan.payDay > 0;
}

export const timeLabels = {
  scheduledFor: (view: ViewResult) => `Scheduled for ${dayLabel(view.invoice, view.recommended.plan.payDay)}`,
  paidOn: (view: ViewResult) => `On ${dayLabel(view.invoice, view.recommended.plan.payDay)} (simulated)`,
  /** Results come after the last repayment, or after the payment if nothing is repaid. */
  daysLater: (view: ViewResult) => {
    const plan = view.recommended.plan;
    return `Simulated: ${plan.closedDay ?? plan.payDay} days later`;
  },
};
