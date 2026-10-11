import { callScript } from "@/lib/ai";
import { jsonResponse, readJsonBody } from "@/lib/ai-route";
import { scriptRequestSchema } from "@/lib/ai-requests";
import { merchant } from "@/lib/data/merchant";
import { runEngine } from "@/lib/engine";
import { CONFIG } from "@/lib/engine/config";
import type { Language } from "@/lib/language";

// Talking points for the founder's phone call. Nothing is sent to the supplier. Nothing from the request is logged.
export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = scriptRequestSchema.safeParse(body.body);
  if (!parsed.success) return jsonResponse({ ok: false, error: "That request wasn't valid." }, 400);

  const { state, language, view: wanted } = parsed.data;
  const extensionDays = state.extensionDays ?? CONFIG.extensionDays;
  const result = runEngine({
    merchant,
    invoice: state.invoice,
    salesDropPercent: state.salesDropPercent,
    cashElsewhere: state.cashElsewhere,
    overdraftRatePct: state.overdraftRatePct,
    extensionDays,
  });
  const view = wanted === "right_sized" ? result.views.rightSized : wanted === "keep_full" ? result.views.keepFull : result.recommended;
  const outcome = await callScript(view.invoice, view.duePlan, language as Language, {
    extensionDays,
    borrowingRemovedRupees: view.askFirst.borrowingRemoved,
  });
  if (outcome.status === "unavailable") console.error(`[ai/call-script] unavailable: ${outcome.reason}`);
  return jsonResponse({ ok: true, outcome });
}
