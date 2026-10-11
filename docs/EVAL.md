# Invoice reading: model evaluation

How well does each model read a supplier invoice? Five synthetic invoices (no real data), each with a ground-truth answer written by hand in `eval/ground-truth/`. Run it with:

```bash
npm run eval:extract -- --model gemini-3.5-flash-lite
```

It makes one live call per invoice (5 in all), with no fallback model and no retry on another model, then appends a dated section below. Once two different models have run, the comparison table below fills in.

## The five invoices

| Invoice | What it tests |
|---|---|
| `invoice-clean.pdf` | The baseline: a clean PDF with everything printed plainly. |
| `invoice-photo.png` | The same invoice photographed at an angle: how much a poor photo costs. |
| `invoice-hidden-discount.pdf` | A 2.5% / 5-day early-payment discount buried in tiny footer terms. |
| `invoice-latefee.pdf` | A late fee only, two line items, and terms ("due within 15 days") instead of a due date. |
| `invoice-hindi-mixed.png` | Hindi and English labels, handwritten-looking, DD-MM-YYYY dates. |

## How it is scored

Ten fields per invoice (supplier, invoice number, invoice date, due date, total, quantity, unit price, discount %, discount days, late fee % per month), so 50 in all.

- **A field is correct** if it equals the ground truth exactly. Names ignore case and punctuation. When the invoice does not state a field, the **right answer is null**: filling it in is wrong. Three are deliberately null on `invoice-latefee.pdf`: the due date (only terms are printed, and the product never works a date out), the unit price (two items, two prices) and both discount fields (there is no discount).
- **A clause is caught** if every field of it is right: discount means both the percent and the days; late fee means the percent per month. Inventing a clause an invoice does not have is a **false alarm**.
- **Quotes exact** means every value the model returned came with a quote that really appears in the printed text of the invoice (ignoring case and spacing).
- **Wrong but high** counts wrong answers the model marked "high" confidence. They are the dangerous ones: the founder confirms every field, but a confident error is easy to miss.
- **Time** is the wall-clock time of the call.

Limits: five invoices, all synthetic and all about shoes, one run per model, and models do not answer identically each time. Treat the numbers as a first signal, not a benchmark.

## Comparison

<!-- SUMMARY:START -->
Only `gemini-3.5-flash-lite` has been run so far. The comparison table appears here once a second model has run.
<!-- SUMMARY:END -->

# Runs

Newest last.

## 2026-10-12: gemini-3.5-flash-lite

Run at 2026-10-11T18:36:50.504Z (UTC). 5 live calls, 13.1s in total. No fallback model.

**50 of 50 fields correct.** Discount clause caught 4 of 4. Late fee caught 5 of 5. False alarms: 0. Quotes exact on 5 of 5 invoices. Wrong answers marked "high" confidence: 0.

| Invoice | Fields correct | Discount | Late fee | Quotes exact | Time | Confidence (high / medium / low) | Wrong but high |
|---|---|---|---|---|---|---|---|
| invoice-clean | 10/10 | caught | caught | yes | 2.5s | 10 / 0 / 0 | 0 |
| invoice-photo | 10/10 | caught | caught | yes | 2.8s | 10 / 0 / 0 | 0 |
| invoice-hidden-discount | 10/10 | caught | caught | yes | 2.5s | 10 / 0 / 0 | 0 |
| invoice-latefee | 10/10 | none (correct) | caught | yes | 2.4s | 6 / 0 / 4 | 0 |
| invoice-hindi-mixed | 10/10 | caught | caught | yes | 2.9s | 10 / 0 / 0 | 0 |

No wrong fields and no inexact quotes.

> **How to read this run.** 50 of 50 is a strong result, but this test is easy for a good model: every invoice is clean, sharply rendered text with no blur, no stamps and no skew beyond the one angled photo. The three hardest tests all passed: it left the due date, unit price and discount **null** on the late-fee invoice instead of working them out (the product rule), it found the 2.5% discount in the tiny footer, and it read the handwritten Hindi-English page including the DD-MM-YYYY dates. It marked the four fields that are correctly null as "low" confidence, which is the right instinct: it knew it had nothing to read. Before trusting one model over another, add harder invoices (a blurry phone photo, a stamped or crossed-out amount, a multi-page invoice, a table with tax lines) and run the second model.

