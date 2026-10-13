import { explainPlan } from "@/lib/ai";
import { jsonResponse, readJsonBody } from "@/lib/ai-route";
import { explainRequestSchema } from "@/lib/ai-requests";
import { merchant } from "@/lib/data/merchant";
import { runEngine } from "@/lib/engine";
import type { Language } from "@/lib/language";

// "Why this plan" in plain words. The server reruns the engine from the confirmed invoice and assumptions, so the
// AI is only ever given numbers the engine produced. Nothing from the request is logged.
export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = explainRequestSchema.safeParse(body.body);
  if (!parsed.success) return jsonResponse({ ok: false, error: "Invalid request." }, 400);

  const { state, language } = parsed.data;
  const result = runEngine({
    merchant,
    invoice: state.invoice,
    salesDropPercent: state.salesDropPercent,
    cashElsewhere: state.cashElsewhere,
    overdraftRatePct: state.overdraftRatePct,
  });
  const outcome = await explainPlan(result, language as Language);
  if (outcome.status === "unavailable") console.error(`[ai/explain] unavailable: ${outcome.reason}`);
  return jsonResponse({ ok: true, outcome });
}
