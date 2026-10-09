# Cash Gap Advisor

Concept prototype for the Razorpay x ISB AI PM challenge. Not affiliated with Razorpay; do not use Razorpay's logo.

## Spec summary

> TODO: `docs/SPEC.md` was missing when Phase 0 was built. Add the file, then replace this
> section with a short summary of the locked spec. `docs/SPEC.md` is the source of truth.

## Stack

Next.js (App Router) + TypeScript + Tailwind. Run with `npm run dev`.

## Rules

1. **Secrets only in `.env.local`.** Never hard-code keys, never commit them, never print them.
2. **`.env.local` stays in `.gitignore`.**
3. **All money calculations are plain code, never the LLM.** The LLM may explain or phrase results; it must never compute amounts, totals, gaps or dates.
4. **Every LLM call goes through `lib/ai.ts`.** No other file imports an AI SDK or calls an AI API.
5. **Label simulated data as simulated in the UI.** Any fake number, transaction or customer must be visibly marked "Simulated".

## AI provider

`lib/ai.ts` reads `AI_PROVIDER` (`gemini` default, or `claude`). Optional overrides: `GEMINI_MODEL`
(default `gemini-3.8-flash`), `CLAUDE_MODEL`. Keys: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`.
