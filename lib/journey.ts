// The decision journey: Invoice -> Cash gap -> Options -> Approve -> Results.
// Everything here is plain TypeScript with no React, so it can be tested directly.
// Money is only ever worked out by the engine and these functions, never by an AI.

import { z } from "zod";
import type { Invoice } from "./data/invoice";
import type { ViewId, ViewResult } from "./engine";
import { CONFIG } from "./engine/config";
import { amountDueOn } from "./engine/gap";
import { interestRate, type FundingOption, type PlanStep } from "./engine/options";
import { formatINR } from "./format";
import type { Language } from "./language";

// ---------- Steps ----------

export const STEPS = [
  { id: "invoice", label: "Invoice", href: "/invoice" },
  { id: "gap", label: "Cash gap", href: "/gap" },
  { id: "options", label: "Options", href: "/options" },
  { id: "approve", label: "Approve", href: "/approve" },
  { id: "results", label: "Results", href: "/results" },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

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
  if (state.invoice === null) return { reachable: false, reason: "Upload and confirm an invoice first." };
  if (step === "approve" && state.chosenView === null) {
    return { reachable: false, reason: "Choose a plan on the Options screen first." };
  }
  if (step === "results" && !state.paid) {
    return { reachable: false, reason: "Approve the plan and pay the supplier first." };
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

// ---------- Option cards ----------

export interface OptionQuote {
  available: boolean;
  cap: number;
  /** How much of the gap this option alone could cover (up to its cap). */
  covers: number;
  /** The true cost in ₹ of covering that amount with this option alone. */
  cost: number;
}

/** What one option would cost if it alone covered the gap, up to its cap. Lets cards be compared side by side. */
export function quoteOption(option: FundingOption, gap: number): OptionQuote {
  const covers = Math.min(gap, option.maxAmount);
  return {
    available: option.maxAmount > 0,
    cap: option.maxAmount,
    covers,
    cost: Math.round(covers * option.costRate),
  };
}

/** The "looks cheap" insight for early settlement: a small fee that is a large rate a year. */
export function earlySettlementInsight(option: FundingOption): string | null {
  if (option.annualisedPct === null) return null;
  return `${CONFIG.earlySettlementFeePct.toFixed(2)}% ≈ ${Math.round(option.annualisedPct)}% a year here`;
}

/** Who provides each source, so the screen never lets a bank overdraft pass for a Razorpay product. */
export const SOURCE_TAGS: Record<FundingOption["id"], { label: string; razorpay: boolean }> = {
  early_settlement: { label: "Your Razorpay sales money", razorpay: true },
  credit_line: { label: "Razorpay partner credit (simulated)", razorpay: true },
  bank_overdraft: { label: "Your own bank, not Razorpay", razorpay: false },
  split_order: { label: "Agreed with your supplier", razorpay: false },
};

/**
 * When the plan uses the founder's own bank overdraft before the Razorpay credit line, say why, in numbers: it costs
 * less for the days the money is needed. Returns null if the plan doesn't use both, or the overdraft isn't cheaper.
 */
export function overdraftFirstNote(args: { options: FundingOption[]; steps: PlanStep[]; loanDays: number }): string | null {
  const { options, steps, loanDays } = args;
  const od = options.find((o) => o.id === "bank_overdraft");
  const credit = options.find((o) => o.id === "credit_line");
  const odStep = steps.find((s) => s.optionId === "bank_overdraft");
  const creditStep = steps.find((s) => s.optionId === "credit_line");
  if (!od || !credit || !odStep || !creditStep || od.costRate >= credit.costRate) return null;
  const sameAmount = odStep.amount;
  const odCost = Math.round(sameAmount * od.costRate);
  const creditCost = Math.round(sameAmount * credit.costRate);
  return `Your own bank overdraft (${formatINR(sameAmount)} at ${od.annualisedPct}%) is used before Razorpay's credit line (${credit.annualisedPct}%) because it costs less for the ${loanDays} days needed: ${formatINR(odCost)} against ${formatINR(creditCost)} on the same ${formatINR(sameAmount)}.`;
}

/** How many days the money from this option is out: early settlement only brings money forward a few days. */
export function daysOut(option: FundingOption, settlementDays: number, loanDays: number): number | null {
  if (option.id === "early_settlement") return settlementDays;
  return option.isBorrowing ? loanDays : null;
}

/**
 * When early settlement is cheaper in rupees than the cheapest loan, say why, in numbers: its yearly rate looks high,
 * but the money is only needed a couple of days, while a loan would run much longer. Returns null if it is not cheaper.
 * `amount` is how much early settlement would cover; `loanDays` is how long a loan would be out.
 */
export function earlySettlementWhy(args: {
  options: FundingOption[];
  amount: number;
  settlementDays: number;
  loanDays: number;
}): string | null {
  const { options, amount, settlementDays, loanDays } = args;
  const early = options.find((o) => o.id === "early_settlement");
  const loans = options.filter((o) => o.isBorrowing && o.maxAmount > 0);
  if (!early || early.annualisedPct === null || loans.length === 0 || amount <= 0) return null;
  const loan = loans.reduce((a, b) => (b.costRate < a.costRate ? b : a));
  if (early.costRate >= loan.costRate) return null;
  const earlyCost = Math.round(amount * early.costRate);
  const loanCost = Math.round(amount * loan.costRate);
  return `High yearly rate (${Math.round(early.annualisedPct)}% a year), but only needed for ${settlementDays} days. A loan would run ${loanDays} days and cost ${formatINR(loanCost)} to cover the same ${formatINR(amount)}, against ${formatINR(earlyCost)} here.`;
}

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
      text: `Pay the supplier by day ${earlyPayDay(invoice)} to get the ${invoice.earlyPayDiscountPct}% discount`,
      detail: `Saves ${formatINR(view.discount.discountAmount)}.`,
      amount: view.discount.discountAmount,
    });
  }
  for (const step of view.recommended.plan.steps) {
    if (step.isBorrowing) continue;
    if (step.optionId === "split_order") {
      const pairs = Math.round(step.amount / invoice.unitPrice);
      nonCredit.push({
        id: step.optionId,
        text: `Have ${pairs} pairs delivered later`,
        detail: `Frees ${formatINR(step.amount)} now. Expected lost margin ${formatINR(step.cost)}.`,
        amount: step.amount,
        cost: step.cost,
      });
    } else {
      nonCredit.push({
        id: step.optionId,
        text: `Settle ${formatINR(step.amount)} of your own sales early`,
        detail: `Fee ${formatINR(step.cost)}. This is your money, not a loan.`,
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

/** How many days borrowed money stays out under this plan (it is needed sooner if paying early). */
export function tenureDays(view: ViewResult): number {
  return view.recommended.timing === "pay_early_for_discount"
    ? CONFIG.borrowDays + (view.invoice.dueInDays - earlyPayDay(view.invoice))
    : CONFIG.borrowDays;
}

// ---------- Key Fact Statement (simulated) ----------

export const SIMULATED_ACCOUNT = "•••• 4321";

/** Shown on the Key Fact Statement: its lender, fees, contacts and cooling-off are placeholders, not a real offer. */
export const KFS_LABEL = "Illustrative values";
export const KFS_DISCLAIMER =
  "Illustrative values: the lender, fees, cooling-off period, grievance contact and account below are placeholders for this concept prototype. They are not a real offer.";

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

/** The numbers shown before any credit is drawn. Interest uses the same formula as the engine, so they always agree. */
export function buildKfs(loanAmount: number, tenure: number): KeyFactStatement {
  const totalInterest = Math.round(loanAmount * interestRate(CONFIG.creditLineRatePct, tenure));
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
    disbursedTo: `Your own bank account ${SIMULATED_ACCOUNT} (simulated). Never to the supplier.`,
    grievance: {
      officer: "Grievance Redressal Officer, Partner NBFC (simulated)",
      email: "grievance@partner-nbfc.example",
      phone: "1800-000-0000 (simulated)",
    },
    coolingOffDays: 3,
  };
}

export function consentText(kfs: KeyFactStatement): string {
  return `I have read the Key Fact Statement. I agree to borrow ${formatINR(kfs.loanAmount)} from ${kfs.lender} at ${kfs.annualRatePct}% a year, and I understand I must repay ${formatINR(kfs.totalRepayable)} ${kfs.tenureDays} days after the money reaches my bank account.`;
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
        `This plan covers only ${formatINR(plan.covered)} of the ${formatINR(plan.gap)} gap, so ${formatINR(plan.uncovered)} is not covered. Go back and choose another plan, or add cash available elsewhere.`,
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
