# Cash Gap Advisor: AI Build Log

Oct 13, 2026 · @Udi

## Overview

This log records how I used AI to research, design and build Cash Gap Advisor, from the first day of the challenge to submission. I've written it the way it happened, including the moments AI got things wrong, the assumptions that broke, and the calls I made myself. I'm not a developer. I wrote no code by hand, and every line of the product was built through AI. Every product decision, and every check on what the AI told me, was mine.

|  |  |
| --- | --- |
| Project | Cash Gap Advisor: a decision layer inside RazorpayX Vendor Payments that tells a D2C founder whether they can safely pay a supplier bill early to keep the discount, and the cheapest safe way to fund it |
| Challenge | Razorpay x ISB AI PM Build Challenge, Track 2 (Recover and Grow with AI) |
| Period | 28 Sep to 13 Oct 2026. Product built 9 to 13 Oct |
| Code | GitHub: udishapandey/cash-gap-advisor. Live on Vercel |
| Result | Working prototype, 743 automated tests, all merchant data synthetic |

### Tools and what each one did

| Tool | Role in the project | Why I chose it |
| --- | --- | --- |
| Claude (chat) | My research partner and spec writer. Explored ideas, checked Razorpay's product pages, RBI rules and bank rates, wrote the instructions I gave Claude Code, and critiqued my screens | I already had a Pro plan, and it is strong at reasoning through long context |
| Claude Code | My engineer. Wrote all the code, tests and docs from plain-English instructions, ran the tests and pushed to GitHub | Builds real, tested software inside the project folder, which no-code builders couldn't do for a money engine |
| Gemini API (Flash-Lite, Flash fallback) | The AI inside the product. Reads the supplier bill, explains the plan in plain words, drafts the message to the supplier | Free tier, reads PDFs and phone photos well |
| ChatGPT | An independent reviewer. Three reviews of the idea, the facts and the UI | A different model catches what the first one misses |

### Rules I set before the build

I wrote these into CLAUDE.md, the instruction file Claude Code reads before every task:

1. **AI interprets and predicts. Code calculates and constrains. The merchant decides.** No AI model ever does money maths.
2. Secrets live only in local and Vercel settings, never in code or on GitHub.
3. Only synthetic invoices go to Gemini. Its free tier may use inputs to improve Google's products.
4. Anything simulated is labelled on screen.
5. Spec first, then code. Commit after every step. Tag a restore point before any big change.
6. Verify real-world facts before building on them. I added this one halfway through, after learning the hard way (see 12 Oct).

## Log, part 1: finding the problem (28 Sep to 8 Oct)

### 28 Sep to 3 Oct: Learning Razorpay's world

- **Goal:** understand the challenge, Razorpay's business and its existing AI products before choosing anything.
- **Tool:** Claude (chat).
- **What AI did:** built me a playbook covering the brief decoded line by line, how Razorpay makes money, how a payment flows, what Agent Studio, RAY and the Agentic Dashboard already do, and a 15-day plan.
- **What I decided:** to spend the first week on the problem, not the build. The scoring rewards problem choice and merchant understanding more than polish.

### 3 to 5 Oct: Idea hunting, and the first time I stopped trusting the AI

- **Goal:** find a merchant problem Razorpay hasn't already solved.
- **Tools:** Claude (chat), then ChatGPT for a second opinion.
- **What happened:** Claude proposed several ideas: winning back offline customers, unblocking held settlements, saving subscription cancellations. When I looked, each one already existed in Razorpay (Billme/Engage, a redesigned risk review, Mandate Cancellation Win-Back). The AI had assumed gaps instead of checking for them.
- **What I did:** told Claude to stop proposing until it had searched Razorpay's site, docs and every Agent Studio industry pack. From then on, every idea came with proof that Razorpay didn't already do it.
- **Two more corrections I made:** Claude was rejecting ideas because a competitor offered them; I pointed out that only overlap with Razorpay's own products matters. Claude also said I needed merchant validation before submitting; I re-read the FAQ, which only asks me to state assumptions and how I'd validate them. Claude re-checked and agreed.
- **Outcome:** two finalists (Revenue Autopilot for failed subscription renewals, Checkout Copilot for D2C checkout drop-off). I had Claude write a context brief so ChatGPT could give an independent view.

### 6 Oct: An alum's advice, and the idea that won

- **Goal:** pick one idea with seven days left.
- **Tool:** Claude (chat).
- **What happened:** an ISB alum told me to lead with an observation about the world, not a feature, and to tie impact to money the founder feels. He also mentioned working capital. Claude filtered his points and advised parking working capital as "not this week".
- **My call:** I explored it anyway. Claude researched Razorpay Capital's credit line (up to ₹25 lakh), Instant Settlements and the Cashflow Forecaster in Agent Studio. Lending itself had no gap. But side by side, the pieces showed one: the forecaster warns about a cash gap, the credit line and instant settlement can fund it, and nothing decides the cheapest way to close it. I dropped both finalists for this idea, then called "Cash Gap Copilot".
- **A warning I didn't act on:** Claude's notes that day said settlement fees and per-day interest needed verifying. I didn't verify them then. It came back to bite me on 12 Oct.

### 7 Oct: Narrowing to one painful moment

- **Goal:** turn a broad "cash copilot" into a problem a judge can feel.
- **Tool:** Claude (chat).
- **What I decided:** focus on one moment. Rahul, a D2C footwear founder selling ₹10–50 lakh a month, gets a big supplier bill for festive stock before festive sales turn into cash. Renamed it Cash Gap Advisor. Claude drafted the problem statement and persona; I cut them down.

### 8 Oct: Choosing the tools and the way of working

- **Goal:** a plan I could finish alone in five days.
- **Tool:** Claude (chat).
- **What AI did:** compared no-code builders against Claude Code, and paid AI APIs against Gemini's free tier.
- **What I decided:** Claude Code with GitHub and Vercel, because the money engine needed real tests and a no-code tool couldn't give me that. Gemini's free tier for the in-product AI, synthetic invoices only. I declined a $5 Claude API credit to keep everything free. Work order: spec first, then phases, then a daily build log.

## Log, part 2: building the product (9 to 12 Oct)

### 9 to 10 Oct: Setup and first deploy

- **Goal:** a live, empty app with a safe path to the AI.
- **Tool:** Claude Code.
- **What AI did:** set up the Next.js project and one AI gateway (`lib/ai.ts`) that every AI call must go through, so I could switch between Gemini and Claude later. A test route proved Gemini could answer through my own server, keeping the API key out of the browser.
- **What went wrong:** the secrets file and docs folder were never created, so I made them by hand. VS Code had the folder in Restricted Mode. Vercel first said "No Next.js version detected", then showed a 404. Claude Code had left the live site pointing at a temporary branch, with the framework preset set to "Other". I set main as the production branch and fixed the preset.
- **What I decided:** start on Gemini's free tier; keep one gateway so providers can be compared; store the spec in the repo; label all simulated data on screen.

### 11 Oct: The engine, and AI catching its own bug

- **Goal:** the maths that decides the plan, plus bill reading.
- **Tool:** Claude Code.
- **What AI did:** built a day-by-day cash timeline and a funding plan, and raised two product questions for me. Running its own checks, it found that the pay-early plan under-borrowed by about ₹39,000 when sales fell 30%, because it only checked one day.
- **What I decided:**
  - A supplier giving extra days is a request, not money in hand, so the plan never depends on it.
  - If sales drop, the right answer is to buy less stock, not borrow more, so the what-if compares both.
  - Every plan is sized to the worst day in the whole window, with a test that the balance never goes negative on any day. A money product must never under-borrow.
- **Bill reading hung:** the first live read took 90 seconds, then failed. Gemini Flash had stalled and its 20-a-day free quota was used up. I had Claude Code put the faster Flash-Lite model first, add a fallback model, timeouts, caching, a saved reading of the sample bill, and manual entry as the last resort.

### 11 Oct (later): Making the AI safe to show a founder

- **Goal:** AI explains the plan in plain words without ever inventing a number.
- **Tools:** Claude Code (build), Gemini (runtime).
- **What went wrong:** the first AI explanation passed every automated check and was still useless. It repeated code names like "peakShortfallRupees" and printed bare numbers like 288151. It also copied "3%" from an example in my prompt. Later, a "why it's cheapest" sentence had correct numbers that didn't visibly add up (₹2,058 cost, ₹10,000 saving, "₹9,107 better off").
- **What I decided:**
  - AI writes words, never numbers. A grounding check rejects any explanation with a number that isn't in the engine's output, and a pre-written explanation is shown instead.
  - Numbers were removed from all prompt examples, and the AI gets clean, pre-formatted facts.
  - Out-of-range what-if questions are rejected, not quietly adjusted.
  - The explanation follows one shape: Do this / Why it's cheapest / Watch out.
- **How I checked the safeguards:** I had Claude Code deliberately break each one (flip a plus to a minus, remove the number check) to confirm the tests failed. They did. Then 11 capped live AI calls tested every AI feature end to end.
- **Lesson:** automated checks catch false numbers. Only a human reading the output catches unhelpful words.

### 12 Oct: The screens were too much

- **Goal:** screens a busy founder understands in five seconds.
- **Tools:** Claude Code, Claude (chat) as critic.
- **What happened:** looking at the screens, I told Claude: "no customer or user is going to read through so much info... I am not sure any PM in the world would approve such a design." Every screen showed all its working at once, in finance jargon.
- **What AI found when I asked it to review its own screens:** real contradictions, not just clutter. One card said a loan ran 30 days and another said 33 (₹1,968 against ₹2,164 for the same money). One screen said "₹9,107 net saving", another "₹11,310 better off", because they used different comparisons. A cost showed as −₹7,942.
- **A bug only my eyes caught:** after the redesign the headline saving showed ₹0. The unit test had passed because it used a simplified input.
- **What I decided:** answer first on every screen (one headline, one number, one button), with the working in collapsed "See how we worked this out" sections. One saving, on one stated basis. A cost is never shown as negative. One banner, "Concept prototype. All merchant data is simulated.", replaces the small badges. I rewrote the screen copy myself in Razorpay's dashboard style (label, number, short caption), and Claude Code built the layout.

### 12 Oct (evening): Asking for an outside opinion

- **Goal:** find my blind spots before the deadline.
- **Tools:** Claude (chat) wrote the brief; ChatGPT reviewed it.
- **What I did:** had Claude write a full review brief instructing the reviewer not to trust my claims and to label everything as verified or not. ChatGPT reviewed the idea, the maths and the UI. That review, and my own questions while studying the product, led straight to the biggest problem of the project.

## Log, part 3: breaking it against the real world (12 to 13 Oct)

### 12 Oct, night: The assumption that broke my headline

- **Goal:** understand my own product well enough to defend it.
- **Tool:** Claude (chat).
- **What happened:** my demo's "aha" was that instant settlement looks expensive (0.30% for 2 days is about 54.75% a year) but beats a credit line held 33 days. While studying it I asked: if Razorpay's credit line allowed free early repayment, would the whole idea fall apart? I asked Claude to check the actual pages, not answer from memory. Razorpay's docs say the credit line has **zero pre-closure charges**. So the 33-day hold was never real. It had crept into the build without anyone checking it.
- **What I said next:** "i dont trust you anymore. i need you to go verify everything first." I stopped all building.
- **What AI did:** checked every assumption in the product (about 25) against a named source: Razorpay docs and blogs, RBI directions, bank rate cards, LiveLaw on the MSMED Act, Shiprocket and Delhivery on COD timing, GoKwik data on returns, Gemini's terms. The results are in the appendix. Several were wrong: the overdraft rate, GST on instant settlement, supplier terms, COD timing and returns.
- **What I decided:** drop the old headline, use only sourced numbers, and label everything that couldn't be sourced (festive uplift, founder behaviour, whether interest is charged daily).

### 12 to 13 Oct, overnight: Does the idea still stand?

- **Goal:** decide whether to continue or pivot with about 20 hours left.
- **Tools:** Claude (chat), ChatGPT (two independent reviews).
- **The hard question I asked:** if the cheapest funding order is always the same, do we even need AI? Claude's answer, which I tested and accepted: the rules choose the funding mix, but the decision changes with the prediction. AI predicts how much cash will actually come in and when (festive sales, COD delays, returns) and re-plans as real sales arrive. Like Google Maps: the routing algorithm is fixed, and the value is predicting traffic.
- **What I did:** had Claude write a go/no-go brief with the full fact-check table, and sent it to ChatGPT. Both reviews said continue, don't pivot: reframe around timing and uncertainty, make prediction and re-planning the AI core, make instant settlement optional, and hide order-size optimisation.
- **Checking the reviewer:** ChatGPT named enterprise products that make this same decision. Claude verified three on the companies' own pages (SAP Taulia, J.P. Morgan with HCL Technologies, Fynex) and refused to cite the rest (Kyriba, HighRadius, C2FO) as unverified marketing. ChatGPT also said one of my numbers was inconsistent and that I shouldn't name the Cashflow Forecaster. I checked both: the number was a same-repayment-date effect, and the Forecaster is real (Razorpay's Agent Studio blog).
- **My call:** continue. The new story: a cash-flow warning isn't enough; find the least-cost safe mix and keep re-planning. I don't claim nobody does this. I claim Razorpay can bring an enterprise treasury decision to small merchants, because it already has the data and the payment rails.

### 13 Oct, morning: The final engine revision

- **Goal:** rebuild the engine on verified facts without breaking the app.
- **Tools:** Claude (chat) wrote the instructions; Claude Code built them.
- **How I worked:** I asked for one complete, corrected instruction set rather than add-ons to old ones ("no i will not append, you need to give me corrected prompt"), and tagged a restore point first.
- **What changed:** daily repayment as cash arrives, most expensive loan first. Funding order: own cash, then bank overdraft (11%), then Razorpay credit line (18%), and instant settlement only if limits run out. A ₹50,000 safety buffer. Pay early only if the discount beats the cost and a low-sales case is still covered. Default: pay on the due date. Supplier terms 2/10 net 30, returns 30%, COD cash about 12–13 days after the order.
- **New demo numbers:** keep the ₹10,000 discount for ₹417 of interest, ₹9,583 better off. Tests went from 627 to 729, then 743.
- **What went wrong:** Claude Code's test runner hung in watch mode and the session was interrupted. I gave it a resume instruction: kill the stuck process, run tests once, commit after every step. The new numbers also made my copy wrong ("You're short" now read like a crisis when the merchant could simply pay on time), so it became "To pay early, you'd be ₹2.3L short for about a week. Paying on 10 Nov needs no borrowing." The mid-season check was dated after the payment, so I moved it before.

### 13 Oct, afternoon: UI review from another AI, filtered

- **What happened:** another AI gave me a UI rewrite, but its dates and numbers were from an older version ("18 Oct", "short on 21 Oct", and no own-cash row in the plan).
- **What I decided:** take its layout ideas, not its numbers. Claude merged the useful parts with the current figures. Results got simpler, and "What if sales are lower?" moved onto the Plan screen as a collapsed section.

### 13 Oct, afternoon: The AI went down in testing

- **What happened:** "Read again with AI" spun forever. I took a screenshot of the Vercel log and shared it. Claude read it: both Gemini models had failed (Flash-Lite timed out at 30 seconds, Flash returned 503 "UNAVAILABLE", meaning overloaded). The real bug was ours: the screen never gave up.
- **Fix:** a 35-second limit, then the saved reading for sample bills or manual entry for uploads, and the same for every other AI feature. If AI is down during judging, the demo still works.

### 13 Oct, afternoon: A second sample bill for judges

- **Tools:** Claude (chat) generated a synthetic PDF bill (Kaveri Soles & Uppers, ₹2,70,000, 1.5% within 15 days, net 45), clearly marked SAMPLE with fake GSTIN and bank details. Claude Code added download links and a saved reading.
- **What it exposed:** the bill printed the late fee as "18% per annum" and the reader showed it as "Missing" because it never converted units. I had it convert yearly to monthly and show the original wording. It also showed that the "What if sales are lower?" check is very cautious for bills with long due dates. On deadline day I chose to document that, not change the engine and risk the tested numbers.

### 13 Oct: Questioning my own assumptions while studying

- **Tools:** Claude (chat), NotebookLM.
- **What I did:** had Claude write a complete knowledge base and loaded it into NotebookLM to quiz myself. Studying it, I challenged an assumption: "dont people just UPI even during COD pickup?" Claude checked: courier COD payouts still take days, but digitally collected COD can settle faster. That makes the cash-timing forecast more important, so I kept it as a labelled assumption.
- **Deferred:** a Hindi interface (RAY already supports Hindi). Only if everything else was submitted first.

## Corrections ledger

Every place AI got something wrong, in order, and who caught it. AI caught some of its own mistakes when I asked it to review its work. I caught the ones that mattered most by asking "is this real?"

| When | What AI got wrong | Caught by | Fix |
| --- | --- | --- | --- |
| 3–5 Oct | Proposed ideas Razorpay already had | Me, checking Razorpay's products | Verify Razorpay's products before any idea |
| 3–5 Oct | Treated a competitor feature as a reason to reject | Me | Only overlap with Razorpay counts |
| 3–5 Oct | Said merchant validation was required before submission | Me, re-reading the FAQ | State assumptions and a validation plan |
| 9–10 Oct | Left the live site on a temporary branch | Vercel error | Main set as production branch |
| 11 Oct | Plan under-borrowed by about ₹39,000 | AI's own check | Size to the worst day; test every day |
| 11 Oct | Plan counted on the supplier granting more days | AI raised it; I decided | Extension is "ask first", never counted on |
| 11 Oct | AI explanation leaked code names and raw digits | Me, reading it | Clean labelled facts; number check |
| 11 Oct | AI copied "3%" from a prompt example | Me | No numbers in prompt examples |
| 12 Oct | Two savings figures; 30 vs 33 days; a negative cost | AI self-review | One basis, one day count, no negative costs |
| 12 Oct | Headline saving showed ₹0 | Me, looking at the screen | Fixed; tests now use realistic input |
| 12 Oct | Credit line held 33 days (the old headline) | Me, asking the question; AI verified | Daily repayment; instant settlement optional |
| 12–13 Oct | Overdraft 14%, no GST, 10-day supplier terms, optimistic COD and returns | Fact-check against sources | Sourced values (appendix) |
| 13 Oct | "You're short" crisis wording after new numbers | Me | Reframed around the choice to pay early |
| 13 Oct | Mid-season check dated after the payment | Me | Moved before payment |
| 13 Oct | Another AI's UI suggestion used outdated numbers | Me | Kept the layout, corrected the numbers |
| 13 Oct | Screen spun forever when Gemini was overloaded | Me, testing; AI read the log | 35-second fallback to saved reading or manual entry |
| 13 Oct | "18% per annum" read as "Missing" | AI flagged it | Convert to monthly, show original wording |

## Reflection

### What AI changed

- **Speed.** In five days I went from an empty folder to a deployed app with a tested money engine, AI bill reading, fallbacks and 743 tests. As a non-developer, I couldn't have built this alone in that time.
- **Research depth.** AI checked about 25 real-world facts against Razorpay, RBI, banks and logistics sources in one night. That would have taken me days.
- **A second pair of eyes on demand.** Self-review by Claude Code and independent reviews by ChatGPT found contradictions I would have shipped.

### What AI didn't do

AI never told me, unprompted, that my headline was wrong. It built on the 33-day assumption for days. Every major correction began with me asking "is this real?" or "would a founder read this?" AI was fast at answering. Asking the right question was my job.

### What I'd do differently

1. Fact-check product terms on day one, before writing a line of code. I'd have saved a full rebuild.
2. Ask the reviewer model to also verify, and then verify the reviewer.
3. Test on the live site with real AI calls earlier. The overload bug showed up only on the last day.
4. Talk to five D2C founders in week one. How often they face this decision is still my biggest unvalidated assumption.

### Open items at submission

- The sales forecast in the prototype is simulated. In production it would come from the merchant's real settlement and COD data.
- Whether Razorpay's credit line charges interest daily isn't public, and the app says so.
- The low-sales safety check is deliberately cautious for long due dates. It's documented in the repo.

## Appendix: the fact-check (assumptions that broke, with sources)

This is the full result of the 12 to 13 Oct fact-check: what I first assumed, what the source says, and what changed in the product.

| Area | What I first assumed | What the source says | What changed | Source |
| --- | --- | --- | --- | --- |
| Razorpay credit line repayment | Held 33 days | Zero pre-closure charges; repay anytime | Daily repayment, most expensive first | [Razorpay docs](https://razorpay.com/docs/x/capital/line-of-credit/) |
| Credit line rate and limit | 18%, ₹3L limit | From 1.5%/month (APR 18–32%); up to ₹25L; ₹20L turnover, 1-year vintage | 18% kept as best case and labelled; limit made illustrative | [Razorpay Learn](https://razorpay.com/learn/business-banking/business-line-of-credit/) |
| Daily interest on credit line | Assumed | Not stated publicly | Labelled "unverified" in the app and docs | Razorpay docs |
| Instant settlement | 0.30%, no GST | 0.30% + 18% GST; per-merchant daily limit | GST added; illustrative ₹2,00,000 daily limit | [Razorpay Instant Settlements docs](https://razorpay.com/docs/payments/settlements/instant/) |
| Bank overdraft | 14% | About 10.5–11.5% for secured MSME borrowing | Changed to 11% | Union Bank MSME rate card |
| Supplier terms | 2% off within 7 days, due in 10 | Typical: "2/10 net 30", 30–60 day credit | Bill changed to 2% within 10 days, due in 30 | Industry trade-credit guides |
| Late payment | 1.5%/month flat | For registered micro/small suppliers, the MSMED Act caps credit at 45 days, interest 3× the RBI bank rate compounded monthly; Section 43B(h) defers the buyer's tax deduction | Added as context; kept 1.5%/month on the sample bill | LiveLaw; TaxGuru |
| COD returns (RTO) | 20% | 20–25% nationally; 25–40% for footwear | Raised to 30% | eGrow (citing GoKwik) |
| COD cash timing | 5–9 days after delivery | Shiprocket: 8–9 days after delivery | Cash now arrives about 12–13 days after the order | [Shiprocket support](https://support.shiprocket.in/) |
| COD share | 40% | About 45% of D2C orders | Raised to 45% | Industry estimate (weakly sourced; labelled) |
| RBI digital lending | Loan must go to borrower | Default yes, with an end-use exception | Credit lands in the merchant's account; supplier paid via RazorpayX | Nishith Desai summary of RBI Directions |
| Festive uplift 1.1/1.4/1.7× | Assumed | No source found | Kept as scenarios and labelled "assumption" | None |
| Founder behaviour | Takes the first loan offered | No source; no interviews | Stated as the biggest unvalidated assumption, with a validation plan | None |

**Things I checked and that held up:** Vendor Payments reads invoices (OCR); Cashflow Forecaster exists in Agent Studio; RAY runs on WhatsApp in English and Hindi; Key Fact Statements are required for MSME loans; Gemini's free tier uses inputs to improve products, so I use synthetic invoices only.

## Sources

- [Razorpay Line of Credit docs](https://razorpay.com/docs/x/capital/line-of-credit/)
- [Razorpay Learn: business line of credit](https://razorpay.com/learn/business-banking/business-line-of-credit/)
- [Razorpay Instant Settlements docs](https://razorpay.com/docs/payments/settlements/instant/)
- [Razorpay Settlements docs](https://razorpay.com/docs/payments/settlements/)
- [Shiprocket COD remittance](https://support.shiprocket.in/)
- [Gemini API terms](https://ai.google.dev/terms)
- Full fact-check table with every source: docs/ASSUMPTIONS.md in the repo (udishapandey/cash-gap-advisor)
