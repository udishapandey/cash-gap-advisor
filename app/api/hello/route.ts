import { askAI } from "@/lib/ai";

export async function GET() {
  try {
    const reply = await askAI(
      'Reply with exactly this sentence and nothing else: "Hello from Gemini, ready to build!"',
    );
    return Response.json({ ok: true, reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
