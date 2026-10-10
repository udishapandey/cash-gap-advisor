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
| 19 | Amount | ₹5,00,000 | Brief | Read from the real invoice (Phase 2 will extract it with AI, and the founder confirms). |
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
| 33 | Split order | Up to 30% of the invoice, ₹0 interest, with a stock-out risk warning | Brief (₹0 + risk note); Claude (30%) | Ask the supplier what splits they accept. Check last season's sell-through for the SKUs involved. |
| 34 | Supplier extension | Asks for 15 extra days. Free if the supplier agrees; if not, priced at the late fee for those 15 days. Up to the full invoice | Brief (₹0 or late fee); Claude (15 days) | Ask the supplier. Record how often they agree. |
| 35 | Recommended plan | Uses the cheapest sources first by rupee cost until the gap is covered. Compares paying early (discount) against paying on the due date. The founder can exclude any option | Brief | Compare with what a finance advisor would pick on real cases. |

## Not modelled yet

- Non-money costs: the split-order stock-out risk and the relationship cost of asking for more time are shown as notes, not given a rupee value.
- Taxes, fees and penalties beyond those above.
- The AI invoice reader, the what-if question box, the call script, the approval flow with the RBI Key Fact Statement, and post-season results (later phases).
