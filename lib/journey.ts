// The decision journey: Invoice -> Cash gap -> Options -> Approve -> Results.
// Everything here is plain TypeScript with no React, so it can be tested directly.
// Money is only ever worked out by the engine and these functions, never by an AI.

import { z } from "zod";
import type { Invoice } from "./data/invoice";
import type { ViewId, ViewResult } from "./engine";
import { CONFIG } from "./engine/config";
import { amountDueOn } from "./engine/gap";
import type { FundingOption, PlanStep } from "./engine/options";
import { formatINR } from "./format";
import type { Language } from "./language";

// ---------- Steps ----------

export const STEPS = [
  { id: "invoice", label: "Bill", href: "/invoice" },
  { id: "gap", label: "Cash gap", href: "/gap" },
  { id: "options", label: "Plan", href: "/options" },
  { id: "approve", label: "Approve", href: "/approve" },
  { id: "results", label: "Results", href: "/results" },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

/** Set when "Confirm bill" hands over to the Cash gap screen, so it can show a short "checking" moment once. */
export const CHECKING_KEY = "cga.checking.v1";

export const SALES_DROPS = [0, 10, 20, 30] as const;

// ---------- Shared state ----------

export interface JourneyState {
  /** The confirmed invoice, mapped into the engine. Null until the founder confirms one. */
  invoice: Invoice | null;
  /** Assumptions made on the founder's behalf while mapping the invoice. */
  notes: string[];
  /** What-if: forecast sales are this % lower. */
  salesDropPercent: number;
  /** Cash available elsewhere, entered by the founder. */
  cashElsewhere: number;
  /** The founder's own bank overdraft rate, % a year. */
  overdraftRatePct: number;
  /** The plan the founder chose. Null until they choose: nothing is pre-selected. */
  chosenView: ViewId | null;
  approved: boolean;
  paid: boolean;
  /** The language of the AI explanation and call script. */
  language: Language;
}

export const DEFAULT_JOURNEY: JourneyState = {
  invoice: null,
  notes: [],
  salesDropPercent: 0,
  cashElsewhere: 0,
  overdraftRatePct: CONFIG.overdraftRatePct,
  chosenView: null,
  approved: false,
  paid: false,
  language: "en",
};

/** The inputs that change the numbers. Changing one clears any chosen plan and approval. */
export const INPUT_KEYS = ["salesDropPercent", "cashElsewhere", "overdraftRatePct"] as const;

export const invoiceSchema = z.object({
  simulated: z.boolean(),
  supplier: z.string(),
  invoiceNumber: z.string(),
  units: z.number().int().positive(),
  unitPrice: z.number().positive(),
  amount: z.number().positive(),
  dueInDays: z.number().positive(),
  earlyPayDiscountPct: z.number().min(0).max(100),
  earlyPayWithinDays: z.number().min(0),
  lateFeePctPerMonth: z.number().min(0).max(100),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// Each field falls back on its own, so one bad value never throws away the rest.
const journeySchema = z.object({
  invoice: invoiceSchema.nullable().catch(null),
  notes: z.array(z.string()).catch([]),
  salesDropPercent: z.number().min(0).max(100).catch(DEFAULT_JOURNEY.salesDropPercent),
  cashElsewhere: z.number().min(0).catch(DEFAULT_JOURNEY.cashElsewhere),
  overdraftRatePct: z.number().min(0).max(100).catch(DEFAULT_JOURNEY.overdraftRatePct),
  chosenView: z.enum(["keep_full", "right_sized"]).nullable().catch(null),
  approved: z.boolean().catch(false),
  paid: z.boolean().catch(false),
  language: z.enum(["en", "hi"]).catch("en"),
});

/** Read saved state. Never throws: anything unusable becomes the default. */
export function parseJourney(raw: unknown): JourneyState {
  const r = journeySchema.safeParse(raw);
  if (!r.success) return { ...DEFAULT_JOURNEY };
  const s = r.data;
  // Approval and payment make no sense without an invoice and a chosen plan.
  const valid = s.invoice !== null && s.chosenView !== null;
  return { ...s, approved: valid && s.approved, paid: valid && s.approved && s.paid };
}

// ---------- Which steps can be opened ----------

export function stepAccess(state: JourneyState, step: StepId): { reachable: boolean; reason?: string } {
  if (step === "invoice") return { reachable: true };
  if (state.invoice === null) return { reachable: false, reason: "Confirm a bill first." };
  if (step === "approve" && state.chosenView === null) {
    return { reachable: false, reason: "Review a plan first." };
  }
  if (step === "results" && !state.paid) {
    return { reachable: false, reason: "Approve and pay the supplier first." };
  }
  return { reachable: true };
}

export type StepStatus = "done" | "current" | "upcoming" | "locked";

/** A step is only ticked once its work has really been done, not just because it comes earlier. */
export function stepComplete(state: JourneyState, step: StepId): boolean {
  switch (step) {
    case "invoice":
    case "gap":
      return state.invoice !== null;
    case "options":
      return state.chosenView !== null;
    case "approve":
      return state.paid;
    case "results":
      return false; // the last step: it is simply where the journey ends
  }
}

/** `current` is null on pages outside the journey, such as the dashboard. */
export function stepStatus(state: JourneyState, step: StepId, current: StepId | null): StepStatus {
  if (step === current) return "current";
  if (!stepAccess(state, step).reachable) return "locked";
  const index = (id: StepId) => STEPS.findIndex((s) => s.id === id);
  const behind = current === null || index(step) < index(current);
  return behind && stepComplete(state, step) ? "done" : "upcoming";
}

// ---------- Who provides each source ----------

/** Who provides each source, so the screen never lets a bank overdraft pass for a Razorpay product. */
export const SOURCE_TAGS: Record<FundingOption["id"], { label: string; razorpay: boolean }> = {
  own_cash: { label: "Your own cash", razorpay: false },
  early_settlement: { label: "Your Razorpay sales money", razorpay: true },
  credit_line: { label: "Razorpay partner credit (simulated)", razorpay: true },
  bank_overdraft: { label: "Your own bank, not Razorpay", razorpay: false },
  split_order: { label: "Agreed with your supplier", razorpay: false },
};

// ---------- Plan sections for the approval screen ----------

export interface ActionLine {
  id: string;
  text: string;
  detail?: string;
  amount?: number;
  cost?: number;
}

export interface PlanSections {
  /** Actions that are not credit: ordering fewer pairs, early settlement, paying early. */
  nonCredit: ActionLine[];
  /** Credit from the partner NBFC. Needs a Key Fact Statement and explicit consent. */
  creditLine: PlanStep | null;
  /** The founder's own bank overdraft. They arrange it themselves with their bank. */
  overdraft: PlanStep | null;
}

/** The last day on which the early-payment discount still applies. */
export function earlyPayDay(invoice: Invoice): number {
  return Math.min(invoice.earlyPayWithinDays, invoice.dueInDays);
}

export function splitPlan(view: ViewResult, fullUnits: number): PlanSections {
  const nonCredit: ActionLine[] = [];
  const { invoice } = view;

  if (view.units < fullUnits) {
    const saved = (fullUnits - view.units) * invoice.unitPrice;
    nonCredit.push({
      id: "right_size_order",
      text: `Order ${view.units} of ${fullUnits} pairs now (${Math.round((view.units / fullUnits) * 100)}%)`,
      detail: `Saves ${formatINR(saved)} on pairs the forecast does not expect to sell.`,
      amount: saved,
    });
  }
  if (view.recommended.timing === "pay_early_for_discount") {
    nonCredit.push({
      id: "pay_early",
      text: `Pay by day ${earlyPayDay(invoice)} for ${invoice.earlyPayDiscountPct}% off`,
      detail: `Saves ${formatINR(view.discount.discountAmount)}.`,
      amount: view.discount.discountAmount,
    });
  }
  for (const step of view.recommended.plan.steps) {
    if (step.isBorrowing) continue;
    if (step.optionId === "own_cash") {
      nonCredit.push({
        id: step.optionId,
        text: `Use ${formatINR(step.amount)} cash`,
        detail: `${formatINR(view.recommended.plan.buffer)} stays as a safety buffer.`,
        amount: step.amount,
        cost: 0,
      });
    } else if (step.optionId === "split_order") {
      const pairs = Math.round(step.amount / invoice.unitPrice);
      nonCredit.push({
        id: step.optionId,
        text: `Deliver ${pairs} pairs later`,
        detail: `Frees ${formatINR(step.amount)} now. Expected lost profit ${formatINR(step.cost)}.`,
        amount: step.amount,
        cost: step.cost,
      });
    } else {
      nonCredit.push({
        id: step.optionId,
        text: `Settle ${formatINR(step.amount)} of sales early`,
        detail: `Fee ${formatINR(step.cost)}. Not a loan.`,
        amount: step.amount,
        cost: step.cost,
      });
    }
  }

  const steps = view.recommended.plan.steps;
  return {
    nonCredit,
    creditLine: steps.find((s) => s.optionId === "credit_line") ?? null,
    overdraft: steps.find((s) => s.optionId === "bank_overdraft") ?? null,
  };
}

/** What the founder pays the supplier, on the day the plan says to pay. */
export function supplierPayment(view: ViewResult): number {
  const day =
    view.recommended.timing === "pay_early_for_discount" ? earlyPayDay(view.invoice) : view.invoice.dueInDays;
  return Math.round(amountDueOn(view.invoice, day));
}

/**
 * How many days the credit line is out under this plan. Loans are repaid as soon as cash allows, so this is the days
 * something was owed in the day-by-day run, not a fixed term.
 */
export function tenureDays(view: ViewResult): number {
  return Math.max(1, view.recommended.plan.sim.stats.credit_line.days);
}

// ---------- Key Fact Statement (simulated) ----------

export const SIMULATED_ACCOUNT = "•••• 4321";

/** Shown on the Key Fact Statement: its lender, fees, contacts and cooling-off are placeholders, not a real offer. */
export const KFS_LABEL = "Illustrative values";
export const KFS_DISCLAIMER =
  "Illustrative values. The lender, fees, cooling-off period, grievance contact and account are placeholders in this prototype. This is not a real offer.";

export interface KeyFactStatement {
  lender: string;
  loanAmount: number;
  annualRatePct: number;
  /** Annual percentage rate including fees. Equal to the rate here, because there are no fees. */
  apr: number;
  tenureDays: number;
  totalInterest: number;
  fees: number;
  totalRepayable: number;
  schedule: { dayAfterDisbursement: number; principal: number; interest: number; total: number }[];
  disbursedTo: string;
  grievance: { officer: string; email: string; phone: string };
  coolingOffDays: number;
}

/** The numbers shown before any credit is drawn. The interest is the engine's own figure for the credit line, so they always agree. */
export function buildKfs(loanAmount: number, tenure: number, interest: number): KeyFactStatement {
  const totalInterest = Math.round(interest);
  const fees = 0; // simulated: no processing fee, so the engine's cost is interest only
  return {
    lender: "Partner NBFC (simulated)",
    loanAmount,
    annualRatePct: CONFIG.creditLineRatePct,
    apr: CONFIG.creditLineRatePct,
    tenureDays: tenure,
    totalInterest,
    fees,
    totalRepayable: loanAmount + totalInterest + fees,
    schedule: [
      {
        dayAfterDisbursement: tenure,
        principal: loanAmount,
        interest: totalInterest,
        total: loanAmount + totalInterest + fees,
      },
    ],
    disbursedTo: `Your bank account ${SIMULATED_ACCOUNT}, simulated. Never to the supplier.`,
    grievance: {
      officer: "Grievance Redressal Officer, Partner NBFC (simulated)",
      email: "grievance@partner-nbfc.example",
      phone: "1800-000-0000 (simulated)",
    },
    coolingOffDays: 3,
  };
}

export function consentText(kfs: KeyFactStatement): string {
  return `I have read the Key Fact Statement. I agree to borrow ${formatINR(kfs.loanAmount)} from ${kfs.lender} at ${kfs.annualRatePct}% a year. I expect to repay ${formatINR(kfs.totalRepayable)} about ${kfs.tenureDays} days after disbursal. I can repay earlier with no pre-closure charge.`;
}

// ---------- Approval rules ----------

export type ApprovalStage = "review" | "pay" | "done";

export function approvalStage(state: Pick<JourneyState, "approved" | "paid">): ApprovalStage {
  if (!state.approved) return "review";
  return state.paid ? "done" : "pay";
}

/** Reasons the chosen plan can't be approved yet. Empty means it can. */
export function approvalBlockers(view: ViewResult): string[] {
  const plan = view.recommended.plan;
  return plan.fullyCovered
    ? []
    : [
        `Covers ${formatINR(plan.covered)} of ${formatINR(plan.gap)}. ${formatINR(plan.uncovered)} is not covered. Add other available cash to proceed.`,
      ];
}

/** Credit from the partner needs explicit consent. No credit means nothing to consent to. */
export function needsCreditConsent(sections: PlanSections): boolean {
  return sections.creditLine !== null && sections.creditLine.amount > 0;
}

export function canApprove(args: { view: ViewResult; sections: PlanSections; consent: boolean }): boolean {
  if (approvalBlockers(args.view).length > 0) return false;
  return needsCreditConsent(args.sections) ? args.consent : true;
}

// ---------- Range bar ----------

export interface RangeBarLayout {
  /** The ₹ value at the right-hand end of the bar. */
  max: number;
  /** Where each marker sits along the bar, 0 to 100. */
  bestPct: number;
  expectedPct: number;
  worstPct: number;
}

/**
 * Where to draw the best case (high sales), expected and worst case (low sales) gaps on a bar.
 * The bar runs from ₹0 to a little past the worst case, so the markers never sit on the edge.
 */
export function rangeBarLayout(best: number, expected: number, worst: number): RangeBarLayout {
  const max = Math.max(worst, expected, best) * 1.15;
  const pct = (v: number) => (max > 0 ? Math.min(100, Math.max(0, (v / max) * 100)) : 0);
  return { max, bestPct: pct(best), expectedPct: pct(expected), worstPct: pct(worst) };
}
