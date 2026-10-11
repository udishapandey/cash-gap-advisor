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

### Known limitation: the loan still grows as sales drop

With these inputs, right-sizing shrinks the loan a lot **compared with keeping the full order** (about ₹1.72L against ₹3.05L at −30% sales), but the right-sized loan at −30% is still **higher than the loan at 0%** (about ₹1.72L against ₹1.17L). A 30% sales drop cuts forecast cash-in by about ₹2.5L, while right-sizing saves only about ₹1.4L of stock cost. The main reason is that "other outflows" (#1) are fixed. In reality courier, fees and part of ad spend would fall with sales, which would narrow this. Treat the "loan shrinks" claim in the spec as true relative to keeping the full order, not relative to the 0% case, until #1 is replaced with real data.

## Not modelled yet

- Non-money costs: the relationship cost of asking the supplier for more time.
- Taxes, fees and penalties beyond those above.
- The AI invoice reader, the what-if question box, the call script, the approval flow with the RBI Key Fact Statement, and post-season results (later phases).
