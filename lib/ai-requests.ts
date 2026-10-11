// What the three AI routes accept. The browser sends the confirmed invoice and the assumptions; the SERVER
// reruns the engine, so the AI only ever sees numbers the engine produced, never numbers the browser made up.

import { z } from "zod";
import { OUTCOME_IDS } from "./engine/outcome";
import { LANGUAGES } from "./language";
import { invoiceSchema, type JourneyState } from "./journey";

export const stateSchema = z.object({
  invoice: invoiceSchema,
  salesDropPercent: z.number().min(0).max(100),
  cashElsewhere: z.number().min(0).max(1_000_000_000),
  overdraftRatePct: z.number().min(0).max(100),
  /** Extra days for the "ask first" card and the call script. */
  extensionDays: z.number().int().min(0).max(45).optional(),
});
export type AiState = z.infer<typeof stateSchema>;

const language = z.enum(LANGUAGES as [string, ...string[]]);

export const explainRequestSchema = z.object({ state: stateSchema, language });
export const scriptRequestSchema = z.object({
  state: stateSchema,
  language,
  /** Which plan the call is about. Defaults to the plan the numbers favour. */
  view: z.enum(["keep_full", "right_sized"]).optional(),
});
export const resultsRequestSchema = z.object({
  /** The state the plan was approved on, the plan that was approved, and which simulated outcome to summarise. */
  state: stateSchema,
  view: z.enum(["keep_full", "right_sized"]),
  outcome: z.enum(OUTCOME_IDS),
  language,
});
export const whatIfRequestSchema = z.object({ question: z.string().trim().min(1).max(300) });

/** The part of the journey the AI routes need. Returns null until an invoice is confirmed. */
export function aiStateFrom(state: JourneyState, extensionDays?: number): AiState | null {
  if (!state.invoice) return null;
  return {
    invoice: state.invoice,
    salesDropPercent: state.salesDropPercent,
    cashElsewhere: state.cashElsewhere,
    overdraftRatePct: state.overdraftRatePct,
    ...(extensionDays !== undefined && { extensionDays }),
  };
}
