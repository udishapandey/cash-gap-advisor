# Cash Gap Advisor — Product Spec (working name)

## One-liner
Forward a supplier bill you can't fully pay, and get the cheapest way to pay it, which is sometimes not borrowing at all.

## Who
Founders of small D2C brands selling ₹10–50L a month on Razorpay, with no finance team.

## The moment (demo)
Weeks before Diwali, the founder gets a ₹5L manufacturer invoice for festive stock, due in 10 days, and is about ₹2–2.5L short.
Diwali is the demo, not the product: any large supplier bill the founder can't fully cover (e.g. a monthly restock) triggers the same decision.

## The journey (8 steps)
1. The founder forwards the invoice (chat-style screen).
2. The AI reads it: amount, due date, early-payment discount, late fee. The founder confirms or edits.
3. The cash gap is shown as a range, including COD cash in transit and expected returns (RTO), with a "low confidence" label when the forecast is shaky.
4. Every option is compared by true cost, with no fixed ranking: early settlement, credit line, split order, supplier extension, the invoice's early-payment discount, the founder's own bank rate.
5. What-if: a slider (sales -10/-20/-30%) plus a typed question. The recommended loan shrinks as sales assumptions drop.
6. For "ask for more time", the AI writes a call script for the founder, not an auto-message to the supplier.
7. One approval screen for the plan, with the loan section clearly separate and its RBI Key Fact Statement (KFS) shown before any credit is drawn.
8. After the season: results against the founder's default choice, and what the system learned.

## How the intelligence is split
- Plain code: all money maths (option costs, interest, annualised settlement cost). It must never be done by the LLM.
- Predictive estimates: festive sales range, COD arrival timing, return risk. Simple statistics on synthetic data in the prototype; trained models on Razorpay data in production.
- LLM: reading the messy invoice, judging dead-stock risk against last season, explaining trade-offs in plain language, writing the call script.

## Real vs simulated in the prototype
- Real: AI invoice reading (Gemini first, Claude switchable via lib/ai.ts), the cost calculator, the slider, what-if answers, the call script, optionally one Razorpay test-mode API call.
- Simulated (must be labelled in the UI): sales and COD data, loan approval, biometric tap, post-season results.

## Trust and compliance
- The founder approves every credit action. No automatic drawdowns.
- Loans go to the founder's own bank account; the founder then pays the supplier as a separate step (RBI Digital Lending Directions).
- Invoice data is used only for this decision.
- The product recommends non-Razorpay options when they are cheaper.
- No dark patterns: no pre-selected loan, no urgency timers, all-in costs shown side by side.

## Metrics
- North star: cost of funds saved compared with the founder's default choice.
- Guardrails: unnecessary borrowing, wrong recommendations, complaints about pushy credit offers.
- Adoption: recommendations accepted vs overridden.

## Out of scope (roadmap)
- Real courier integration for COD (Shiprocket/Delhivery).
- Auto-detecting bills from RazorpayX payouts.
- Standing rules / higher autonomy.
- Offline and kirana merchants.

## Build tiers
- Must (by Saturday): upload → extract → confirm → gap → options → slider → approval.
- Should (Sunday): typed what-if agent, call script, results screen.
- Nice to have: Razorpay test-mode API call (real test payments as sales history).

## Stack
Next.js + TypeScript on Vercel, built with Claude Code, code on GitHub, all AI calls through one switchable gateway (lib/ai.ts, Gemini default).
