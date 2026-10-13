// Everything about an extracted invoice that is NOT the AI call: the shape we accept from the AI,
// the form the founder confirms, and the mapping into the engine. Plain TypeScript, no AI.
// Dates and money are never worked out by the AI: it only reads what is printed.

import { z } from "zod";
import type { Invoice } from "./data/invoice";
import { formatINR } from "./format";

export type Confidence = "high" | "medium" | "low";

export const FIELD_KEYS = [
  "supplierName",
  "invoiceNumber",
  "invoiceDate",
  "dueDate",
  "totalAmount",
  "quantity",
  "unitPrice",
  "earlyPaymentDiscountPercent",
  "earlyPaymentDiscountDays",
  "lateFeePercentPerMonth",
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export interface FieldMeta {
  key: FieldKey;
  label: string;
  input: "text" | "date" | "number";
  /** Needed to run the cash-gap engine. */
  required: boolean;
  hint?: string;
}

export const FIELDS: FieldMeta[] = [
  { key: "supplierName", label: "Supplier name", input: "text", required: false },
  { key: "invoiceNumber", label: "Invoice number", input: "text", required: false },
  { key: "invoiceDate", label: "Invoice date", input: "date", required: true },
  { key: "dueDate", label: "Due date", input: "date", required: true },
  { key: "totalAmount", label: "Total amount (₹)", input: "number", required: true },
  { key: "quantity", label: "Quantity (pairs)", input: "number", required: true },
  { key: "unitPrice", label: "Unit price (₹)", input: "number", required: false },
  {
    key: "earlyPaymentDiscountPercent",
    label: "Early-payment discount (%)",
    input: "number",
    required: false,
    hint: "Leave empty if the invoice offers none.",
  },
  {
    key: "earlyPaymentDiscountDays",
    label: "Discount applies if paid within (days of invoice date)",
    input: "number",
    required: false,
  },
  {
    key: "lateFeePercentPerMonth",
    label: "Late fee (% per month)",
    input: "number",
    required: false,
    hint: "Leave empty if the invoice states none.",
  },
];

// ---------- What we accept from the AI ----------

const confidenceSchema = z.enum(["high", "medium", "low"]);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "not a real date");

export interface ExtractedField<T> {
  value: T | null;
  evidence: string | null;
  confidence: Confidence;
}

/** One extracted field: { value, evidence, confidence }. */
function field<T extends z.ZodType>(value: T) {
  return z.object({
    value: value.nullable(),
    evidence: z.string().nullable(),
    confidence: confidenceSchema,
  });
}

export const extractionSchema = z.object({
  supplierName: field(z.string().trim().min(1)),
  invoiceNumber: field(z.string().trim().min(1)),
  invoiceDate: field(isoDate),
  dueDate: field(isoDate),
  totalAmount: field(z.number().positive()),
  quantity: field(z.number().int().positive()),
  unitPrice: field(z.number().positive()),
  earlyPaymentDiscountPercent: field(z.number().min(0).max(100)),
  earlyPaymentDiscountDays: field(z.number().int().min(0)),
  lateFeePercentPerMonth: field(z.number().min(0).max(100)),
});

export type InvoiceExtraction = z.infer<typeof extractionSchema>;

/**
 * Two safety rules applied to every field after validation: a missing value carries no evidence
 * and low confidence, and a value with no evidence quoted is downgraded to low confidence
 * (it may be a guess).
 */
function normalise(extraction: InvoiceExtraction): InvoiceExtraction {
  const out = { ...extraction } as Record<FieldKey, ExtractedField<unknown>>;
  for (const key of FIELD_KEYS) {
    const f = extraction[key] as ExtractedField<unknown>;
    if (f.value === null) {
      out[key] = { value: null, evidence: null, confidence: "low" };
    } else {
      const evidence = f.evidence?.trim() ? f.evidence : null;
      out[key] = { value: f.value, evidence, confidence: evidence ? f.confidence : "low" };
    }
  }
  return out as unknown as InvoiceExtraction;
}

export type ParseExtractionResult =
  | { ok: true; data: InvoiceExtraction }
  | { ok: false; message: string };

/**
 * Check the AI's answer. Never throws. The error message names the fields that were wrong
 * but never repeats their contents, so nothing from the invoice ends up in an error or a log.
 */
export function parseExtraction(raw: unknown): ParseExtractionResult {
  const result = extractionSchema.safeParse(raw);
  if (result.success) return { ok: true, data: normalise(result.data) };
  const fields = [...new Set(result.error.issues.map((i) => String(i.path[0] ?? "response")))];
  return {
    ok: false,
    message: `Couldn't read these fields: ${fields.join(", ")}. Try again or upload a clearer copy.`,
  };
}

/** An extraction with nothing found, used for manual entry. Every field is empty. */
export function emptyExtraction(): InvoiceExtraction {
  const blank = { value: null, evidence: null, confidence: "low" as const };
  return Object.fromEntries(FIELD_KEYS.map((k) => [k, { ...blank }])) as unknown as InvoiceExtraction;
}

// ---------- The form the founder confirms ----------

export type FormValues = Record<FieldKey, string>;

export function toFormValues(extraction: InvoiceExtraction): FormValues {
  return Object.fromEntries(
    FIELD_KEYS.map((k) => [k, extraction[k].value === null ? "" : String(extraction[k].value)]),
  ) as FormValues;
}

export interface ConfirmedInvoice {
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  quantity: number;
  unitPrice: number | null;
  earlyPaymentDiscountPercent: number | null;
  earlyPaymentDiscountDays: number | null;
  lateFeePercentPerMonth: number | null;
}

export type FieldErrors = Partial<Record<FieldKey, string>>;
export type ParseConfirmedResult =
  | { ok: true; data: ConfirmedInvoice }
  | { ok: false; errors: FieldErrors };

const toNumber = (s: string): number => Number(s.replace(/[₹,\s]/g, ""));

/** Turn the founder's edited form into checked numbers and dates. Never throws. */
export function parseConfirmed(values: FormValues): ParseConfirmedResult {
  const errors: FieldErrors = {};
  const text = (k: FieldKey) => values[k].trim();

  const date = (k: "invoiceDate" | "dueDate"): string | null => {
    const s = text(k);
    if (!s) return (errors[k] = "Required to plan the cash gap."), null;
    if (!isoDate.safeParse(s).success) return (errors[k] = "Enter a valid date."), null;
    return s;
  };
  const num = (k: FieldKey, opts: { required: boolean; integer?: boolean; max?: number; positive?: boolean }) => {
    const s = text(k);
    if (!s) {
      if (opts.required) errors[k] = "Required to plan the cash gap.";
      return null;
    }
    const n = toNumber(s);
    if (!Number.isFinite(n)) return (errors[k] = "Enter a number."), null;
    if (opts.positive && n <= 0) return (errors[k] = "Must be more than 0."), null;
    if (n < 0) return (errors[k] = "Can't be negative."), null;
    if (opts.integer && !Number.isInteger(n)) return (errors[k] = "Enter a whole number."), null;
    if (opts.max !== undefined && n > opts.max) return (errors[k] = `Can't be more than ${opts.max}.`), null;
    return n;
  };

  const invoiceDate = date("invoiceDate");
  const dueDate = date("dueDate");
  const totalAmount = num("totalAmount", { required: true, positive: true });
  const quantity = num("quantity", { required: true, positive: true, integer: true });
  const unitPrice = num("unitPrice", { required: false, positive: true });
  const discountPct = num("earlyPaymentDiscountPercent", { required: false, max: 100 });
  const discountDays = num("earlyPaymentDiscountDays", { required: false, integer: true });
  const lateFee = num("lateFeePercentPerMonth", { required: false, max: 100 });

  if (invoiceDate && dueDate && daysBetween(invoiceDate, dueDate) < 1) {
    errors.dueDate = "The due date must be after the invoice date.";
  }
  if ((discountPct === null) !== (discountDays === null)) {
    const missing: FieldKey = discountPct === null ? "earlyPaymentDiscountPercent" : "earlyPaymentDiscountDays";
    errors[missing] = "Enter both the discount % and the number of days, or leave both empty.";
  }

  if (Object.keys(errors).length > 0 || !invoiceDate || !dueDate || totalAmount === null || quantity === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    data: {
      supplierName: text("supplierName") || null,
      invoiceNumber: text("invoiceNumber") || null,
      invoiceDate,
      dueDate,
      totalAmount,
      quantity,
      unitPrice,
      earlyPaymentDiscountPercent: discountPct,
      earlyPaymentDiscountDays: discountDays,
      lateFeePercentPerMonth: lateFee,
    },
  };
}

// ---------- Into the engine ----------

/** Whole days from date `a` to date `b` (both YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export type ToEngineInvoiceResult =
  | { ok: true; invoice: Invoice; notes: string[] }
  | { ok: false; error: string };

/**
 * Map the confirmed invoice into the engine's Invoice. The simulated sales data is anchored to one
 * day, so by default the invoice is treated as received on its invoice date ("today").
 * `notes` lists every assumption made on the founder's behalf so the UI can show them.
 */
export function toEngineInvoice(
  c: ConfirmedInvoice,
  opts: { today?: string } = {},
): ToEngineInvoiceResult {
  const today = opts.today ?? c.invoiceDate;
  const dueInDays = daysBetween(today, c.dueDate);
  if (dueInDays < 1) {
    return { ok: false, error: `The due date (${c.dueDate}) is not after today (${today}). There is nothing left to plan.` };
  }
  const notes: string[] = [];

  // The engine's unit price is what one pair costs in total, so units × price is exactly the amount to pay.
  const unitPrice = c.totalAmount / c.quantity;
  if (c.unitPrice !== null && Math.abs(c.unitPrice * c.quantity - c.totalAmount) > 1) {
    notes.push(
      `The total (${formatINR(c.totalAmount)}) differs from quantity × unit price (${formatINR(c.unitPrice * c.quantity)}), for example because of tax. Using ${formatINR(unitPrice)} per pair, the total divided by the quantity.`,
    );
  }

  // The discount window is counted from the invoice date, so part of it may already be used up.
  let discountPct = 0;
  let discountWithinDays = 1;
  if (c.earlyPaymentDiscountPercent && c.earlyPaymentDiscountDays !== null) {
    const elapsed = Math.max(0, daysBetween(c.invoiceDate, today));
    const remaining = c.earlyPaymentDiscountDays - elapsed;
    if (remaining >= 1) {
      discountPct = c.earlyPaymentDiscountPercent;
      discountWithinDays = remaining;
    } else {
      notes.push("The early-payment discount window has already passed, so no discount is assumed.");
    }
  }

  if (c.lateFeePercentPerMonth === null) {
    notes.push("The invoice states no late fee, so none is assumed.");
  }

  return {
    ok: true,
    notes,
    invoice: {
      simulated: false,
      supplier: c.supplierName ?? "Unknown supplier",
      invoiceNumber: c.invoiceNumber ?? "n/a",
      units: c.quantity,
      unitPrice,
      amount: c.totalAmount,
      dueInDays,
      earlyPayDiscountPct: discountPct,
      earlyPayWithinDays: discountWithinDays,
      lateFeePctPerMonth: c.lateFeePercentPerMonth ?? 0,
      startDate: today,
    },
  };
}
