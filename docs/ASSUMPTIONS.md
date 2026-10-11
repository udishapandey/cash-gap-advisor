# Assumptions

Everything the Phase 1 engine takes as given. **All merchant and invoice data is simulated.** Rates and fees are illustrative for the prototype, not quotes from Razorpay or any lender.

**Source** says where a value came from:
- **Brief**: stated in the Phase 1 instructions.
- **Claude**: chosen by Claude to fill a gap. Needs the product owner's sign-off.

Where each value lives in code: `lib/engine/config.ts` (rates and multipliers), `lib/data/merchant.ts`, `lib/data/invoice.ts`.

## ⚠️ The one to review first: other outflows

| # | Assumption | Value | Source | How we'd verify with real data |
|---|---|---|---|---|
| 1 | Other money going out before the due date (ads, courier, salaries, rent, GST, other suppliers) | ₹1,05,000 per day | **Claude. Calibrated, not observed.** | Take 3–6 months of the merchant's bank statement (or RazorpayX payouts), group outflows by type, and compute the average daily outflow in the weeks before a festival. |

**Why this exists.** The brief's formula counts cash coming in but no other cash going out. With the brief's numbers alone (₹30L a month, ₹1.5L balance), the sample merchant has about ₹13.2L arriving by the due date against a ₹5L invoice: a ₹8.2L surplus and no gap. The spec's demo story is a ₹2–2.5L gap, so this assumption was set to make the expected gap about ₹2.3L. It is roughly equal to daily sales, which is high. Treat the demo gap as illustrative until a real figure replaces this one.

## Merchant ("Rahul's shoe brand", simulated)

| # | Assumption | Value | Source | How we'd verify with real data |
|---|---|---|---|---|
| 2 | Monthly sales | ~₹30L (about ₹1L a day) | Brief | Sum captured payments plus COD orders over the last 3 months using the Razorpay Payments API and the merchant's order system. |
| 3 | History length | 90 days of daily orders | Brief | Pull 90 days of orders by day. |
| 4 | Payment mix | 60% prepaid, 40% COD (by order count; values follow) | Brief | Share of orders by payment method from order data. |
| 5 | Average order value | ₹2,000 | Claude | Mean order value from real orders. |
| 6 | Day-to-day variation | Orders vary ±12% randomly; weekends about 17% busier than weekdays | Claude | Compare real weekday and weekend order counts. |
| 7 | Last year's Diwali uplift | 1.4x (₹1.4L a day against a ₹1L baseline, over the 14 days before Diwali) | Brief | Compare daily sales in the 14 days before last Diwali against the 30 days before that. Repeat for 2+ years. |
| 8 | Bank balance today | ₹1,50,000 | Brief | Read the live balance through bank or account-aggregator access, with consent. |
| 9 | Prepaid settlement | T+2: an order reaches the bank 2 days later | Brief | Compare order date with the settlement date in Razorpay settlement reports. Holidays and weekends may push it out. |
| 10 | COD payout delay | 5–9 days after the order, spread evenly (each day 5, 6, 7, 8, 9 equally likely) | Brief (range); Claude (even spread) | Measure the actual days from order to payout per courier remittance file. Replace the even spread with the real distribution. |
| 11 | COD return rate (RTO) | 20% of COD orders never pay out | Brief | Returned COD orders divided by shipped COD orders, from courier data. Check it rises or falls in festive season. |
| 12 | Prepaid returns and refunds | Ignored (0%) | Claude | Refund rate from the Razorpay refunds API. |
| 13 | Gateway fees, GST, chargebacks, settlement holds | Ignored | Claude | Use net settlement amounts, not gross, from settlement reports. |

## Forecast

| # | Assumption | Value | Source | How we'd verify with real data |
|---|---|---|---|---|
| 14 | Baseline daily sales for the forecast | Average of the last 30 days | Claude | Back-test: on past dates, compare the 30-day-average forecast with what happened. |
| 15 | Festive scenarios | Low 1.1x, expected 1.4x, high 1.7x of baseline | Brief | Back-test against last 2–3 festive seasons. Widen or narrow the range to match real misses. |
| 16 | Uplift timing | The multiplier applies to every forecast day up to the due date | Claude | Check the real daily curve before Diwali. Uplift usually builds up rather than starting at full strength on day 1. |
| 17 | Low-confidence rule | Flag when (worst gap − best gap) is wider than 40% of the invoice | Brief | Check that flagged cases really were the less predictable ones. |
| 18 | Sales what-if | The sales drop scales forecast sales only, never orders already placed | Claude | Compare against real weak-season weeks. |

## Invoice (simulated)

| # | Assumption | Value | Source | How we'd verify with real data |
|---|---|---|---|---|
| 19 | Amount | 500 pairs × ₹1,000 = ₹5,00,000 (amount is always units × unit price) | Brief | Read from the real invoice (Phase 2 will extract it with AI, and the founder confirms). |
| 20 | Due date | 10 days from today | Brief | Same. |
| 21 | Early-payment discount | 2% if paid within 7 days | Brief | Same. |
| 22 | Late fee | 1.5% a month of the amount | Brief | Same. Check the supplier contract for how it is actually charged. |

## Funding options

| # | Assumption | Value | Source | How we'd verify with real data |
|---|---|---|---|---|
| 23 | Early settlement fee | 0.30% of the amount advanced | Brief | Check Razorpay's current instant-settlement pricing for the merchant's plan. |
| 24 | Days advanced by early settlement | 2 (equal to the settlement delay) | Claude | Same as #9. |
| 25 | Early settlement cap | Only prepaid sales already earned by the payment day that would not settle until later | Brief (cap); Claude (exact definition) | Compare with the amount actually eligible for instant settlement in the dashboard. |
| 26 | Annualised cost of early settlement | fee × 365 ÷ days advanced (0.30% × 365 ÷ 2 = 54.75%) | Brief | Pure maths. Shown for comparison with loans. Ranking uses the rupee cost, because 2 days of fee is small in rupees. |
| 27 | Credit line | 18% a year, simple interest | Brief | Take the rate from a real lender offer and its Key Fact Statement. |
| 28 | Credit line limit | ₹3,00,000 pre-approved (simulated) | Claude | Read the real approved limit. |
| 29 | Founder's bank overdraft | 14% a year (editable), limit ₹1,00,000 | Brief (rate); Claude (limit) | Ask the founder for their real rate and limit. |
| 30 | How long borrowed money stays out | 30 days | Claude | Measure how fast cash recovers after festive sales. |
| 31 | Interest method | Simple interest: rate × days ÷ 365 | Claude | Compare with the lender's schedule, which may add fees and compounding. |
| 32 | Early-payment discount value | 2% of the amount, minus the extra funding cost of needing the cash 3 days sooner. Worth it only if every source together can cover the larger, earlier gap | Brief | Run on real invoices and compare with what founders actually did. |
| 33 | Split order | Defers up to 30% of the pairs (150 of 500) to a later delivery. No interest. Priced at the expected lost gross margin on the deferred pairs (see #38). Excluded from the "keep the full order" view | Brief (pricing); Claude (30%) | Ask the supplier what splits they accept. Check last season's sell-through for the SKUs involved. |
| 34 | Supplier extension | **Never counted as certain and never in the plan.** Shown separately as "Ask first": if the supplier agrees to N extra days (default 15), how much borrowing it removes, measured by rerunning the plan on the later date. It can remove nothing, e.g. when sales are weak and cash goes out faster than it comes in | Brief (never certain); Claude (15 days default) | Ask the supplier. Record how often they agree and for how many days. |
| 35 | Late fee | 1.5% a month of the invoice, pro-rated by days. Shown only as the cost of missing the due date, never as a way to pay | Brief | Same as #22. |
| 36 | Recommended plan | Uses only confirmed sources (early settlement, bank overdraft, credit line, ordering fewer pairs), cheapest first by rupee cost, until the gap is covered. If they can't cover it, the shortfall is shown as uncovered. Compares paying early (discount) against paying on the due date. The founder can exclude any option | Brief | Compare with what a finance advisor would pick on real cases. |
| 37 | What counts as "the loan" | Credit line plus bank overdraft in the recommended plan. Early settlement is the merchant's own money, so it is not counted as borrowing | Claude | Confirm with the merchant how they think of settlement advances. |

## Stock and order sizing

| # | Assumption | Value | Source | How we'd verify with real data |
|---|---|---|---|---|
| 38 | Expected lost margin (split order) | pairs not ordered × probability they would sell × gross margin per pair. The pairs left off are the last ones, so the probability is the share of them that falls inside forecast demand | Brief | Compare against real stock-outs: sales lost per pair short in past seasons. |
| 39 | Selling price | ₹1,700 per pair | Brief | Average realised price per pair from the order data, after discounts. |
| 40 | Gross margin | 40% of selling price = ₹680 per pair | Brief | Selling price minus landed cost, from the merchant's books. **Does not match #19:** a ₹1,700 pair bought at ₹1,000 implies ₹700 (41%). The brief's 40% is used as given. |
| 41 | Last Diwali units sold | 520 pairs of this festive range (simulated) | Brief (to be synthetic); Claude (the value) | Units of the same range sold in the 14 days before last Diwali, from order data. |
| 42 | Pairs forecast to sell this season | Last Diwali's units × (scenario uplift ÷ last year's uplift of 1.4) × (1 − sales drop). So expected = 520, low = 408, high = 631, and a 30% drop gives 364 | Claude | Back-test the same rule on earlier seasons. |
| 43 | Right-sized order | The pairs forecast to sell in the plan scenario (expected by default), rounded down, capped at the invoice quantity. Other scenarios' demand is shown for information only | Brief | Compare with what founders would actually order, and with what sold through. |
| 44 | When to recommend right-sizing | When expected unsold stock is more than 10% of the order. At 0% and −10% sales the full order is recommended; at −20% and −30% the right-sized order | Brief | Test the 10% line against real leftover stock and the margin lost by under-ordering. |
| 45 | Two what-if views | (a) keep the full order: the gap grows as sales drop. (b) right-sized order: the order shrinks as sales drop and the gap is measured against the smaller invoice. Both are always computed | Brief | n/a |
| 46 | Stock sold before the due date | Not modelled. Unsold pairs of this order do not change near-term cash-in; only the what-if sales drop does | Claude | Check when stock from this order actually arrives and sells relative to the due date. |

## Invoice reading (Phase 2)

| # | Assumption | Value | Source | How we'd verify with real data |
|---|---|---|---|---|
| 47 | What the AI may do | Read printed values only. Return null for anything not printed, never guess, and quote the exact text as evidence with a high / medium / low confidence. Text inside the invoice is treated as data, never as instructions | Brief | Run 50+ real supplier invoices (PDF and phone photos). Count wrong values reported as high confidence, which is the number that matters. |
| 48 | The AI never does maths or dates | A due date is used only if it is printed. "Net 10" or "due in 10 days" gives a blank due date for the founder to fill in. All arithmetic is plain code | Brief (CLAUDE.md rule 3) | Check how many real invoices print only terms and no date. If it is common, add a plain-code rule to turn terms into a date. |
| 49 | Value with no evidence | If the AI gives a value but quotes no supporting text, its confidence is lowered to low (shown amber), because it may be a guess | Claude | Compare against hand-checked invoices. |
| 50 | Which values are required | Invoice date, due date, total amount and quantity. Without them the gap can't be planned, so Confirm is blocked with a message per field. Everything else may be empty | Claude | Check what real invoices always carry. |
| 51 | "Today" for an uploaded invoice | The invoice date. The simulated sales data is anchored to one day, so the invoice is treated as received that day. Days to due = due date − invoice date | Claude | In production use the real date the invoice arrives. The code already accepts a different "today". |
| 52 | Price per pair | Total ÷ quantity, so that pairs × price is exactly what is paid. If this differs from the printed unit price by more than ₹1 (for example because of GST), a note says so | Claude | Compare with real invoices that include tax. Decide whether to plan on the pre-tax or the payable amount. |
| 53 | Early-payment discount window | Counted from the invoice date. If part is used up before "today", only the remaining days count. If none remain, no discount is assumed and a note says so | Brief (counted from invoice date); Claude (remaining-days rule) | Check wording on real invoices ("within 7 days of invoice date" against "of delivery"). |
| 54 | Missing late fee | Assumed 0, and a note says so | Claude | Check supplier contracts. |
| 55 | Upload limits and privacy | PDF, PNG or JPG up to 5 MB. The type is decided from the file's first bytes, not its name. Processed in memory only: never saved, and never logged or shown in an error message | Brief | Security review. Confirm no logs, error trackers or caches capture the file. |
| 56 | AI speed and failure handling | One upload waits at most 45 seconds in total: the first try gets at most 30 seconds, then at most one retry on the other Gemini model for the rest. The default main model is `gemini-3.5-flash-lite`; its fallback is `gemini-3.8-flash`. If you choose `gemini-3.8-flash` as the main model, the fallback is Flash-Lite (a model can't back itself up). The retry happens on a 429, a 500/503, a timeout, a network error or an empty answer. Bad requests and bad keys (other 4xx) are never retried. Thinking is set to the lowest level each model accepts: "minimal" on Flash-Lite, and "low" on `gemini-3.8-flash` (it rejects "minimal" with HTTP 400) | Brief (45 seconds, one retry, 429 and timeout fall back, Flash-Lite as default); Claude (30/15 split, the "other model" rule) | Compare accuracy and speed of both models on 50+ real invoices. Check how often the retry fires in real use. |
| 57 | What the /invoice page shows | The gap range for keeping the full order (low / expected / high sales). Not yet the right-sizing view | Claude | n/a until the plan screen is built. |
| 58 | What is simulated on /invoice | The invoice is real input (the sample is a synthetic file). Sales, COD, balance and limits are still simulated and labelled | Brief | n/a |
| 59 | Free-tier quota | The Gemini free tier allows 20 requests per day per project for `gemini-3.8-flash` (found from a real 429: `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, limit 20, resets at midnight Pacific time). Quotas are counted per model, so the other model still answers when one is used up. A 429 on both is shown honestly ("free daily limit reached, resets in about N hours", or "try again in a minute" for a per-minute limit). Flash-Lite's own daily limit was not found in the docs | Observed | Check the limits in AI Studio for the project's real plan. In production use a paid tier. |
| 60 | Fallbacks after an AI failure | Only after the AI fails to read a file (never after a wrong file type or size), the page offers two buttons. "Continue with pre-read sample" uses values saved from an earlier real reading of the synthetic sample invoice and is labelled "Pre-read — AI unavailable". "Enter invoice manually" opens an empty form with no amber warnings. Both go through the same confirm step | Brief | n/a. A demo safety net, never a substitute for reading a real invoice. |
| 61 | Mock AI | `AI_MOCK=true` makes `extractInvoice` return the pre-read sample after 1.5 seconds with no API call and no key needed. The page shows a "Mock AI" badge. It must be off in production | Brief | n/a. Development only. |
| 62 | Reusing an earlier reading | The page fingerprints each uploaded file (SHA-256) and keeps the AI's reading in this browser tab's session storage, the 20 most recent files. Uploading the same file again shows the saved reading labelled "Read earlier" and makes no AI call. "Read again with the AI" forces a new call. Only live readings are saved (not mock, pre-read or manual). Only the extracted fields are stored, never the file | Brief | Decide whether a saved reading should expire. Check what real invoices from one supplier look like when re-sent with small changes (a new hash, so a new reading). |
| 63 | Hosting limits (Vercel) | The route sets a 60 second maximum duration to cover the 45 second AI budget. Vercel's request body limit for functions is 4.5 MB, below our 5 MB upload limit, so files between 4.5 and 5 MB would be refused there | Claude | Check the plan's limits on Vercel. Lower the upload limit to 4 MB, or upload directly to storage, before relying on large files. |

## Decision journey (Phase 3)

| # | Assumption | Value | Source | How we'd verify with real data |
|---|---|---|---|---|
| 64 | Cash available elsewhere | Entered by the founder (default ₹0) and added to cash in, rupee for rupee. It is labelled "Your input", not simulated. It is assumed usable by the due date | Brief | Ask what balances the founder could really move in time, and how fast. |
| 65 | Overdraft rate | Editable, default 14% a year. The overdraft limit (₹1,00,000) stays simulated | Brief | Ask the founder for their bank's real rate and limit. |
| 66 | What each option card shows | The cost of that option alone covering the expected gap on the full order, up to its cap, so the cards compare like with like. The recommended plans below them mix options, so their costs differ | Claude | Check founders read the cards the intended way. |
| 67 | The early-settlement "looks cheap" insight | 0.30% for the 2 days it brings money forward is shown as about 55% a year (the exact figure, 54.75%, is on the card) | Brief | Pure maths. |
| 68 | Nothing is pre-selected | The founder must choose a plan: no plan, no consent box and no approval is ever pre-chosen. The green "Recommended" outline is a highlight only. Changing any number (sales change, cash elsewhere, overdraft rate) or the invoice clears the chosen plan and any approval, so an outdated plan can never be approved | Brief (spec: no pre-selected loan) | Usability-test whether founders notice the highlight and still choose themselves. |
| 69 | A plan that doesn't cover the gap | It can't be chosen or approved. The screen says how much is uncovered | Claude | n/a |
| 70 | "Why this plan" | A plain-text template that prints the engine's own arithmetic: cash needed, cash expected, the gap, each source as amount × rate = cost, why options were not used, the order size and the early-payment trade-off. No AI. Phase 4 may rewrite the words but never the numbers | Brief | n/a |
| 71 | Key Fact Statement (all simulated) | Lender "Partner NBFC (simulated)". The credit-line amount is whatever the chosen plan uses. Rate 18% a year, **no fees (₹0)**, so the APR equals the rate. One repayment at the end of the tenure: 30 days, or 33 if the plan pays early. Total interest uses the same formula as the engine, so the two always agree. A 3 day cooling-off period, a fictional grievance contact and a fictional account ending 4321 are placeholders | Brief (fields to show); Claude (the values, fees and cooling-off) | Replace with a real lender's statement. Check fees, APR, tenure options and the cooling-off period required under the RBI Digital Lending Directions. |
| 72 | Credit versus your own overdraft | Only the partner credit line needs the Key Fact Statement and consent. The founder's own bank overdraft is drawn by the founder at their own bank, so it appears in the credit section with a note that it is outside this approval and is never drawn for them | Claude | Confirm with a compliance reviewer which products need a Key Fact Statement. |
| 73 | Approval | Consent is needed only when partner credit is used. "Approve with Touch ID" is a simulated 1.2 second pause: no biometric is read. Nothing is drawn automatically | Brief | Production uses a real authenticator and a real lender integration. |
| 74 | Paying the supplier | A separate step after approval. The amount is the discounted invoice if the plan pays early, otherwise the full amount, and it follows the right-sized order if that plan was chosen. A simulated 1 second pause, then a success screen | Brief | n/a |
| 75 | Where journey state lives | In this browser tab's session storage only (invoice, assumptions, chosen plan, approval). Refreshing keeps your place. Editing or replacing the invoice unconfirms it | Claude | Decide how long a saved decision should live in production. |

### Known limitation: the loan still grows as sales drop

With these inputs, right-sizing shrinks the loan a lot **compared with keeping the full order** (about ₹1.72L against ₹3.05L at −30% sales), but the right-sized loan at −30% is still **higher than the loan at 0%** (about ₹1.72L against ₹1.17L). A 30% sales drop cuts forecast cash-in by about ₹2.5L, while right-sizing saves only about ₹1.4L of stock cost. The main reason is that "other outflows" (#1) are fixed. In reality courier, fees and part of ad spend would fall with sales, which would narrow this. Treat the "loan shrinks" claim in the spec as true relative to keeping the full order, not relative to the 0% case, until #1 is replaced with real data.

## Not modelled yet

- Non-money costs: the relationship cost of asking the supplier for more time.
- Taxes, fees and penalties beyond those above.
- The AI invoice reader, the what-if question box, the call script, the approval flow with the RBI Key Fact Statement, and post-season results (later phases).
