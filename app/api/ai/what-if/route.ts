import { interpretWhatIf } from "@/lib/ai";
import { jsonResponse, readJsonBody } from "@/lib/ai-route";
import { whatIfRequestSchema } from "@/lib/ai-requests";
import { UNMAPPABLE_MESSAGE } from "@/lib/whatif";

// Turns a typed question into at most four settings. The browser applies them and reruns the engine.
// The question itself is never logged.
export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = whatIfRequestSchema.safeParse(body.body);
  if (!parsed.success) {
    // An empty or very long question is simply not a what-if we can answer.
    return jsonResponse({ ok: true, outcome: { status: "unmappable", message: UNMAPPABLE_MESSAGE, mock: false } });
  }
  const outcome = await interpretWhatIf(parsed.data.question);
  if (outcome.status === "error") console.error("[ai/what-if] error");
  return jsonResponse({ ok: true, outcome });
}
