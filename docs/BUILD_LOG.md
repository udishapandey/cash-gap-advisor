## Day 1 — Fri 9 Oct / Sat 10 Oct

**What AI did:** Claude Code set up the Next.js project, the AI gateway (lib/ai.ts) that switches between Gemini and Claude, and a test API route. Gemini replied through my own server.

**What went wrong:** .env.local and the docs folder weren't created; I created them manually. VS Code was in Restricted Mode; I trusted the folder.

**What I decided:** Started on Gemini's free tier; kept one AI gateway so I can compare providers later; stored the spec in the repo; labelled all simulated data in the UI.

## Day 2 — Sun 11 Oct

**What AI did:** Claude Code built the engine and raised two product questions.

**What I decided:** (1) A supplier extension is a request, not confirmed funding, so the plan never depends on it; (2) the what-if compares keeping the full order with right-sizing it, because the right answer to lower sales is to buy less stock, not to borrow more.


## Day 2 (later) — Sun 11 Oct: AI judgement layer and safeguards

**What AI did:** Claude Code built invoice reading, the decision screens, then the AI layer: a plain-language explanation, a supplier call script and a typed what-if. It found its own bug: the pay-early plan under-borrowed by about ₹39,000 at -30% sales because it checked only one day. It also ran a live smoke test of every AI feature (11 real calls, capped).

**What went wrong:** (1) The under-borrowing bug above. (2) The AI's first explanation passed every automated check but was useless to a founder: correct numbers, wrong content. It repeated field names like "peakShortfallRupees" and gave bare numbers like 288151. (3) Later, the "why cheapest" sentence had correct numbers that did not visibly add up (₹2,058 cost, ₹10,000 saving, "₹9,107 better off").

**What I decided:**
- Every plan must be sized to the peak shortfall across the whole window, with a test that no plan ever goes negative on any day. A money product must never under-borrow.
- AI writes words, never numbers: a grounding check rejects any AI explanation containing a number not in the engine's output. I deliberately broke each safeguard to confirm the tests catch it (mutation testing).
- Out-of-range what-ifs are rejected, not silently adjusted: changing the user's question would be misleading.
- Automated checks catch false numbers; only human review catches unhelpful wording. I restructured the output into "Do this / Why it's cheapest / Watch out", and made the cost sentence include the extra cost of paying early so it adds up.


## Day 3 — Mon 12 Oct: Plain-language redesign

**What AI did:** Claude Code restructured all five screens. Redesigned for progressive disclosure and plain language after self-review: screens showed all the working at once and used finance jargon a founder wouldn't use. Each screen now answers first (one headline, one number, one button) with the proof in collapsed "See how we worked this out" sections; finance terms were renamed on screen only, and the engine, its tests and its numbers were left unchanged.

**What went wrong:** The self-review found real inconsistencies, not just clutter: option cards said loans were out for 30 days while the plan said 33 (₹1,968 against ₹2,164 for the same money); Options said "₹9,107 net saving" while Results said "₹11,310 better off" because they used different comparison bases; and a "your plan cost −₹7,942" line showed a cost as a negative number. A bug of the redesign itself was only caught by looking at the screen: the new headline saving came out as ₹0 because of a spread-order mistake, and the unit test had missed it because it passed a simplified input.

**What I decided:** One headline saving on one stated basis (against the usual way: Razorpay credit line, then your bank's overdraft, paid on the due date, no discount); one day count per plan; a cost is never shown as negative; one top banner replaces the per-item "Simulated" badges; the sidebar is only the app name and Dashboard.

