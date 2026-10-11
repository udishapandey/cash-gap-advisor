// The typed what-if. A founder's question is turned into at most four numbers. The AI never decides anything
// else: whatever it says is checked against strict ranges, and code (not the AI) applies the settings and
// reruns the engine. Plain TypeScript, no AI.

import { z } from "zod";
import { formatINR } from "./format";

export const UNMAPPABLE_MESSAGE =
  "I can answer what-ifs about sales, supplier days, extra cash or your bank rate.";

/** The ranges the engine is willing to be asked about. */
export const WHAT_IF_RANGES = {
  salesDropPercent: { min: 0, max: 50, label: "a sales drop of 0% to 50%" },
  supplierExtensionDays: { min: 0, max: 45, label: "0 to 45 extra supplier days" },
  cashElsewhere: { min: 0, max: 1_000_000, label: "extra cash of ₹0 to ₹10,00,000" },
  bankRatePercent: { min: 5, max: 36, label: "a bank rate of 5% to 36%" },
} as const;
export type WhatIfField = keyof typeof WHAT_IF_RANGES;

export interface WhatIfSettings {
  salesDropPercent?: number;
  supplierExtensionDays?: number;
  cashElsewhere?: number;
  bankRatePercent?: number;
}

// The model may leave a field out or send null for "not mentioned". Anything else must be a number in range.
const field = (f: WhatIfField) => z.number().finite().min(WHAT_IF_RANGES[f].min).max(WHAT_IF_RANGES[f].max).nullish();

export const whatIfSchema = z.object({
  salesDropPercent: field("salesDropPercent"),
  supplierExtensionDays: field("supplierExtensionDays"),
  cashElsewhere: field("cashElsewhere"),
  bankRatePercent: field("bankRatePercent"),
});

export type ParseWhatIfResult =
  | { ok: true; settings: WhatIfSettings }
  | { ok: false; reason: "out_of_range" | "invalid"; message: string };

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Check what the AI returned. A value outside its range makes the whole answer invalid (it is rejected, not
 * quietly changed, because "sales drop 80%" is not the same question as "sales drop 50%"). An empty object is fine:
 * it means the question could not be mapped.
 */
export function parseWhatIf(raw: unknown): ParseWhatIfResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "invalid", message: "The AI's answer wasn't in the expected format." };
  }
  const r = whatIfSchema.safeParse(raw);
  if (!r.success) {
    const range = r.error.issues.find((i) => i.code === "too_big" || i.code === "too_small");
    if (range) {
      const f = String(range.path[0]) as WhatIfField;
      return {
        ok: false,
        reason: "out_of_range",
        message: `That's outside what I can model. I can try ${WHAT_IF_RANGES[f]?.label ?? "values in range"}.`,
      };
    }
    return { ok: false, reason: "invalid", message: "The AI's answer wasn't in the expected format." };
  }
  const settings: WhatIfSettings = {};
  const v = r.data;
  if (v.salesDropPercent != null) settings.salesDropPercent = round1(v.salesDropPercent);
  if (v.supplierExtensionDays != null) settings.supplierExtensionDays = Math.round(v.supplierExtensionDays);
  if (v.cashElsewhere != null) settings.cashElsewhere = Math.round(v.cashElsewhere);
  if (v.bankRatePercent != null) settings.bankRatePercent = round1(v.bankRatePercent);
  return { ok: true, settings };
}

/** A second line of defence: whatever reaches the engine is inside the ranges, whoever called us. */
export function clampWhatIf(settings: WhatIfSettings): WhatIfSettings {
  const out: WhatIfSettings = {};
  for (const f of Object.keys(WHAT_IF_RANGES) as WhatIfField[]) {
    const value = settings[f];
    if (typeof value === "number" && Number.isFinite(value)) {
      out[f] = Math.min(WHAT_IF_RANGES[f].max, Math.max(WHAT_IF_RANGES[f].min, value));
    }
  }
  return out;
}

export const isEmptyWhatIf = (s: WhatIfSettings) => Object.keys(s).length === 0;

/** The small trace shown under the box: "Understood as: sales −25% → recalculated". */
export function describeSettings(settings: WhatIfSettings): string {
  const parts: string[] = [];
  if (settings.salesDropPercent !== undefined) {
    parts.push(settings.salesDropPercent === 0 ? "sales unchanged" : `sales −${settings.salesDropPercent}%`);
  }
  if (settings.supplierExtensionDays !== undefined) {
    parts.push(settings.supplierExtensionDays === 0 ? "no supplier extension" : `supplier +${settings.supplierExtensionDays} days`);
  }
  if (settings.cashElsewhere !== undefined) parts.push(`extra cash ${formatINR(settings.cashElsewhere)}`);
  if (settings.bankRatePercent !== undefined) parts.push(`bank rate ${settings.bankRatePercent}%`);
  return `Understood as: ${parts.join(", ")} → recalculated`;
}

export interface AppliedWhatIf {
  /** Changes to the journey's assumptions (the slider, the cash box, the overdraft rate). */
  patch: { salesDropPercent?: number; cashElsewhere?: number; overdraftRatePct?: number };
  /** Extra days to ask the supplier for, for the "Ask first" card. */
  extensionDays?: number;
}

/** Turn settings into the changes to make. Clamps again, so the engine can never be given an out-of-range value. */
export function applyWhatIf(settings: WhatIfSettings): AppliedWhatIf {
  const s = clampWhatIf(settings);
  const patch: AppliedWhatIf["patch"] = {};
  if (s.salesDropPercent !== undefined) patch.salesDropPercent = s.salesDropPercent;
  if (s.cashElsewhere !== undefined) patch.cashElsewhere = s.cashElsewhere;
  if (s.bankRatePercent !== undefined) patch.overdraftRatePct = s.bankRatePercent;
  return { patch, ...(s.supplierExtensionDays !== undefined && { extensionDays: s.supplierExtensionDays }) };
}

export const normaliseQuestion = (q: string) => q.trim().replace(/\s+/g, " ").toLowerCase();

// ---------- Mock mode ----------

const MULTIPLIER = { lakh: 100_000, lac: 100_000, crore: 10_000_000 } as const;

/**
 * What the mock "AI" returns in AI_MOCK=true mode: a simple pattern reader for the four kinds of question.
 * Its answer is NOT checked here: it goes through the same range check as a real AI answer.
 */
export function mockInterpret(question: string): Record<string, number> {
  const q = question.toLowerCase().replace(/(\d),(\d)/g, "$1$2");
  const out: Record<string, number> = {};
  const num = String.raw`(\d+(?:\.\d+)?)`;
  const pct = String.raw`\s*(?:%|percent|per cent)`;

  const sales =
    q.match(new RegExp(String.raw`sales?[^.\d]{0,25}?(?:drop|fall|fell|decline|decrease|down|lower|less|dip|slump|shrink)[^.\d]{0,15}?${num}${pct}`)) ??
    q.match(new RegExp(`${num}${pct}\\s*(?:drop|fall|decline|decrease|dip|lower|less|slump)\\s*(?:in|of)?\\s*sales`)) ??
    q.match(new RegExp(`sales?\\s*(?:are|is|were|go|goes)?\\s*${num}${pct}\\s*(?:lower|less|down)`)) ??
    q.match(new RegExp(`sales?\\s*[-−–]\\s*${num}\\s*%`));
  if (sales) out.salesDropPercent = Number(sales[1]);

  const days = q.match(/(\d+)\s*(?:more |extra |additional )?days?/);
  if (days && /(supplier|vendor|extend|extension|more days|extra days|additional days|more time|grace)/.test(q)) {
    out.supplierExtensionDays = Number(days[1]);
  }

  const cash = q.match(new RegExp(String.raw`(?:₹|rs\.?|inr)\s*${num}\s*(lakh|lac|crore)?`));
  if (cash && /(cash|savings|extra|elsewhere|available|add)/.test(q)) {
    const mult = cash[2] ? MULTIPLIER[cash[2] as keyof typeof MULTIPLIER] : 1;
    out.cashElsewhere = Number(cash[1]) * mult;
  }

  const bank =
    q.match(new RegExp(String.raw`(?:bank|overdraft)[^.\d%]{0,20}?rate[^.\d%]{0,15}?${num}${pct}`)) ??
    q.match(new RegExp(`${num}${pct}\\s*(?:overdraft|bank)\\s*rate`));
  if (bank) out.bankRatePercent = Number(bank[1]);

  return out;
}
