# Cash Gap Advisor

Concept prototype for the Razorpay x ISB AI PM challenge. Not affiliated with Razorpay; do not use Razorpay's logo.

## Spec summary

Locked spec: `docs/SPEC.md` (source of truth; read it before building any feature).

- **Product:** the founder forwards a supplier bill they can't fully pay, and gets the cheapest way to pay it, which is sometimes not borrowing at all.
- **User:** founders of small D2C brands (₹10–50L/month on Razorpay) with no finance team. Demo: a ₹5L pre-Diwali invoice, due in 10 days, with a ₹2–2.5L gap. Diwali is the demo, not the product.
- **Journey:** forward invoice → AI extracts, founder confirms → cash gap as a range (COD in transit, RTO, "low confidence" label) → all options compared by true cost, no fixed ranking → what-if slider (-10/-20/-30%) plus typed question → call script for "ask for more time" → one approval screen with the loan section separate and the RBI KFS shown first → post-season results.
- **Split of work:** plain code does all money maths; simple statistics on synthetic data do the estimates; the LLM reads invoices, judges dead-stock risk, explains trade-offs and writes the call script.
- **Real:** AI invoice reading, cost calculator, slider, what-if answers, call script (optionally one Razorpay test-mode call). **Simulated (label in UI):** sales and COD data, loan approval, biometric tap, post-season results.
- **Trust:** founder approves every credit action, no auto-drawdowns; loans go to the founder's own bank account, then they pay the supplier separately; invoice data used only for this decision; recommend non-Razorpay options when cheaper; no dark patterns (no pre-selected loan, no urgency timers, all-in costs side by side).
- **Build tiers:** Must (Saturday): upload → extract → confirm → gap → options → slider → approval. Should (Sunday): typed what-if agent, call script, results screen. Nice: Razorpay test-mode API call.
- **Out of scope:** real courier integration, RazorpayX bill detection, standing rules/autonomy, offline/kirana merchants.

## Stack

Next.js (App Router) + TypeScript + Tailwind. Run with `npm run dev`. Tests: `npm test` (Vitest).

Invoice reading: `extractInvoice` in `lib/ai.ts` (the only AI call that sees a file), `lib/invoice-extraction.ts` (zod schema, form parsing, mapping into the engine), route `app/api/parse-invoice`, page `/invoice`. Sample invoices are in `public/samples/` (synthetic).

Check the AI reader against a real file: `npm run try:extract` (clean sample) or `npm run try:extract -- path/to/file.png`. It times the call and prints the provider's real error if it fails. Each call uses the free quota (20 a day per model on `gemini-3.8-flash`), so don't loop it.

Money engine: `lib/engine/` (`gap.ts`, `options.ts`, `index.ts`; every rate lives in `config.ts`). Simulated data: `lib/data/`. Every assumption is listed in `docs/ASSUMPTIONS.md`; update it whenever an assumption changes.

## Rules

1. **Secrets only in `.env.local`.** Never hard-code keys, never commit them, never print them.
2. **`.env.local` stays in `.gitignore`.**
3. **All money calculations are plain code, never the LLM.** The LLM may explain or phrase results; it must never compute amounts, totals, gaps or dates.
4. **Every LLM call goes through `lib/ai.ts`.** No other file imports an AI SDK or calls an AI API.
5. **Label simulated data as simulated in the UI.** Any fake number, transaction or customer must be visibly marked "Simulated".
6. **Invoice files are private.** Process them in memory only. Never save one to disk, and never log or echo its contents or file name (including in error messages). The AI only reads printed values: it returns null for anything missing, quotes its evidence, and never calculates amounts or dates.

## AI provider

`lib/ai.ts` reads `AI_PROVIDER` (`gemini` default, or `claude`). Optional overrides: `GEMINI_MODEL`
(default `gemini-3.8-flash`), `GEMINI_FALLBACK_MODEL` (default `gemini-3.5-flash-lite`, or `off`), `CLAUDE_MODEL`.
Keys: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`. Invoice reading waits at most 45 seconds with at most one retry.
