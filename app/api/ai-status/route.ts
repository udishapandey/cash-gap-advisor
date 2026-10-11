import { connection } from "next/server";
import { isMockAi } from "@/lib/ai";

// Tells the page whether development mock mode is on, so it can show a "Mock AI" badge.
// Reveals nothing else: no keys, no model names.
export async function GET() {
  await connection(); // evaluate on every request, not once at build time
  return Response.json({ mock: isMockAi() }, { headers: { "Cache-Control": "no-store" } });
}
