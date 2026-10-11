import { summariseOutcome } from "@/lib/ai";
import { resultsFacts } from "@/lib/ai-facts";
import { jsonResponse, readJsonBody } from "@/lib/ai-route";
import { resultsRequestSchema } from "@/lib/ai-requests";
import { merchant } from "@/lib/data/merchant";
import { runEngine } from "@/lib/engine";
import { outcomeForState } from "@/lib/results";
import type { Language } from "@/lib/language";

// One plain sentence on how the approved plan did after the season. The server reruns the engine and the outcome from
// the confirmed invoice, so the AI only ever sees numbers the engine produced. Nothing from the request is logged.
export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = resultsRequestSchema.safeParse(body.body);
  if (!parsed.success) return jsonResponse({ ok: false, error: "That request wasn't valid." }, 400);

  const { state, view, outcome: id, language } = parsed.data;
  const result = runEngine({
    merchant,
    invoice: state.invoice,
    salesDropPercent: state.salesDropPercent,
    cashElsewhere: state.cashElsewhere,
    overdraftRatePct: state.overdraftRatePct,
  });
  const outcome = outcomeForState(result, { chosenView: view, salesDropPercent: state.salesDropPercent, cashElsewhere: state.cashElsewhere }, id);
  if (!outcome) return jsonResponse({ ok: false, error: "That request wasn't valid." }, 400);

  const answer = await summariseOutcome(resultsFacts(outcome), language as Language);
  if (answer.status === "unavailable") console.error(`[ai/results-summary] unavailable: ${answer.reason}`);
  return jsonResponse({ ok: true, outcome: answer });
}
