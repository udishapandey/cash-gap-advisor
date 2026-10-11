// Scoring and reporting for `npm run eval:extract`. Plain TypeScript, no AI and no network: it only compares what a
// model returned with the ground truth, so it can be tested directly.

import { FIELD_KEYS, type Confidence, type FieldKey } from "./invoice-extraction";

export type TruthValue = string | number | null;

export interface GroundTruth {
  file: string;
  layout: string;
  notes?: string;
  /** What the invoice really says. null means the invoice does not state it, and the model must say null too. */
  fields: Record<FieldKey, TruthValue>;
  /** Other spellings that are also right, for text fields (for example a name printed in two scripts). */
  alsoAccept?: Partial<Record<FieldKey, string[]>>;
}

/** What the model returned for one field. */
export interface Extracted {
  value: TruthValue;
  evidence: string | null;
  confidence: Confidence;
}

// ---------- comparing ----------

/** Lower-case, one form of each character, spaces collapsed. For comparing quotes. */
export function squash(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** For names: letters, digits and marks only, so "Pvt. Ltd" and "pvt ltd" match. Devanagari is kept. */
function nameKey(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\p{M}]/gu, "");
}

export function fieldCorrect(key: FieldKey, got: TruthValue, truth: GroundTruth): boolean {
  const want = truth.fields[key];
  if (want === null) return got === null; // an invoice that doesn't say it: the right answer is null
  if (got === null) return false;
  if (typeof want === "number") return typeof got === "number" && Math.abs(got - want) < 1e-6;
  if (typeof got !== "string") return false;
  if (key === "supplierName" || key === "invoiceNumber") {
    return [want, ...(truth.alsoAccept?.[key] ?? [])].some((w) => nameKey(w) === nameKey(got));
  }
  return got.trim() === want; // dates: exactly YYYY-MM-DD
}

/** Is the quote really in the printed text, character for character (apart from spacing and case)? */
export function evidenceExact(evidence: string, printedText: string): boolean {
  const e = squash(evidence);
  return e.length > 0 && squash(printedText).includes(e);
}

// ---------- scoring one invoice ----------

export type ClauseOutcome = "caught" | "missed" | "correctly_none" | "false_alarm";

export interface FieldScore {
  key: FieldKey;
  expected: TruthValue;
  got: TruthValue;
  correct: boolean;
  evidence: string | null;
  /** null when there is nothing to check (no value, so no quote is expected). */
  evidenceExact: boolean | null;
  confidence: Confidence;
}

export interface InvoiceScore {
  fieldsCorrect: number;
  fieldsTotal: number;
  fields: FieldScore[];
  /** The early-payment discount clause: both the percent and the days must be right. */
  discount: { present: boolean; outcome: ClauseOutcome };
  /** The late-fee clause: the percent per month must be right. */
  lateFee: { present: boolean; outcome: ClauseOutcome };
  /** True if every value the model returned came with a quote that is really in the printed text. */
  evidenceAllExact: boolean;
  evidenceChecked: number;
  evidenceBad: string[];
  confidence: { high: number; medium: number; low: number };
  /** Wrong answers that the model marked "high" confidence: the dangerous kind. */
  wrongButHigh: number;
}

function clauseOutcome(present: boolean, allCorrect: boolean, gotAny: boolean): ClauseOutcome {
  if (present) return allCorrect ? "caught" : "missed";
  return gotAny ? "false_alarm" : "correctly_none";
}

export function scoreInvoice(extracted: Record<FieldKey, Extracted>, truth: GroundTruth, printedText: string): InvoiceScore {
  const fields: FieldScore[] = FIELD_KEYS.map((key) => {
    const x = extracted[key];
    const correct = fieldCorrect(key, x.value, truth);
    return {
      key,
      expected: truth.fields[key],
      got: x.value,
      correct,
      evidence: x.evidence,
      evidenceExact: x.value === null ? null : x.evidence !== null && evidenceExact(x.evidence, printedText),
      confidence: x.confidence,
    };
  });
  const byKey = Object.fromEntries(fields.map((f) => [f.key, f])) as Record<FieldKey, FieldScore>;
  const discountPresent = truth.fields.earlyPaymentDiscountPercent !== null;
  const lateFeePresent = truth.fields.lateFeePercentPerMonth !== null;
  const checked = fields.filter((f) => f.evidenceExact !== null);
  const bad = checked.filter((f) => f.evidenceExact === false).map((f) => f.key);
  const confidence = { high: 0, medium: 0, low: 0 };
  for (const f of fields) confidence[f.confidence] += 1;

  return {
    fieldsCorrect: fields.filter((f) => f.correct).length,
    fieldsTotal: fields.length,
    fields,
    discount: {
      present: discountPresent,
      outcome: clauseOutcome(
        discountPresent,
        byKey.earlyPaymentDiscountPercent.correct && byKey.earlyPaymentDiscountDays.correct,
        byKey.earlyPaymentDiscountPercent.got !== null || byKey.earlyPaymentDiscountDays.got !== null,
      ),
    },
    lateFee: {
      present: lateFeePresent,
      outcome: clauseOutcome(lateFeePresent, byKey.lateFeePercentPerMonth.correct, byKey.lateFeePercentPerMonth.got !== null),
    },
    evidenceAllExact: bad.length === 0,
    evidenceChecked: checked.length,
    evidenceBad: bad,
    confidence,
    wrongButHigh: fields.filter((f) => !f.correct && f.confidence === "high").length,
  };
}

/** The score for a call that failed: every field wrong. A failed call must not earn credit for fields that are null. */
export function failedScore(truth: GroundTruth): InvoiceScore {
  const fields: FieldScore[] = FIELD_KEYS.map((key) => ({
    key,
    expected: truth.fields[key],
    got: null,
    correct: false,
    evidence: null,
    evidenceExact: null,
    confidence: "low",
  }));
  const discountPresent = truth.fields.earlyPaymentDiscountPercent !== null;
  const lateFeePresent = truth.fields.lateFeePercentPerMonth !== null;
  return {
    fieldsCorrect: 0,
    fieldsTotal: fields.length,
    fields,
    discount: { present: discountPresent, outcome: discountPresent ? "missed" : "correctly_none" },
    lateFee: { present: lateFeePresent, outcome: lateFeePresent ? "missed" : "correctly_none" },
    evidenceAllExact: false,
    evidenceChecked: 0,
    evidenceBad: [],
    confidence: { high: 0, medium: 0, low: fields.length },
    wrongButHigh: 0,
  };
}

// ---------- one run, and the report ----------

export interface InvoiceRun {
  name: string;
  file: string;
  layout: string;
  /** False if the AI call failed or its answer was unusable: then every field counts as wrong. */
  ok: boolean;
  error?: string;
  modelUsed?: string;
  ms: number;
  score: InvoiceScore;
}

export interface EvalRun {
  model: string;
  /** ISO timestamp of the run (UTC). */
  at: string;
  /** The calendar date where the run was made (local time), YYYY-MM-DD. Falls back to the UTC date. */
  date?: string;
  calls: number;
  totalMs: number;
  invoices: InvoiceRun[];
}

export interface RunTotals {
  fieldsCorrect: number;
  fieldsTotal: number;
  discountCaught: number;
  discountPresent: number;
  lateFeeCaught: number;
  lateFeePresent: number;
  falseAlarms: number;
  evidenceExact: number;
  invoices: number;
  avgMs: number;
  wrongButHigh: number;
  failedCalls: number;
}

export function totals(run: EvalRun): RunTotals {
  const s = run.invoices.map((i) => i.score);
  return {
    fieldsCorrect: s.reduce((t, x) => t + x.fieldsCorrect, 0),
    fieldsTotal: s.reduce((t, x) => t + x.fieldsTotal, 0),
    discountCaught: s.filter((x) => x.discount.outcome === "caught").length,
    discountPresent: s.filter((x) => x.discount.present).length,
    lateFeeCaught: s.filter((x) => x.lateFee.outcome === "caught").length,
    lateFeePresent: s.filter((x) => x.lateFee.present).length,
    falseAlarms: s.filter((x) => x.discount.outcome === "false_alarm").length + s.filter((x) => x.lateFee.outcome === "false_alarm").length,
    evidenceExact: run.invoices.filter((i) => i.ok && i.score.evidenceAllExact).length,
    invoices: run.invoices.length,
    avgMs: run.invoices.length ? Math.round(run.invoices.reduce((t, i) => t + i.ms, 0) / run.invoices.length) : 0,
    wrongButHigh: s.reduce((t, x) => t + x.wrongButHigh, 0),
    failedCalls: run.invoices.filter((i) => !i.ok).length,
  };
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const show = (v: TruthValue) => (v === null ? "null" : typeof v === "string" ? `"${v}"` : String(v));
const clause = (c: { present: boolean; outcome: ClauseOutcome }) =>
  ({ caught: "caught", missed: "MISSED", correctly_none: "none (correct)", false_alarm: "FALSE ALARM" })[c.outcome];

/** The date a run was made on: the local calendar date if it was recorded, otherwise the UTC date. */
export const runDate = (run: EvalRun) => run.date ?? run.at.slice(0, 10);

/** Today's local calendar date, YYYY-MM-DD (not the UTC date, which can be a day behind). */
export function localDate(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** One dated section for one model: a row per invoice, then every field the model got wrong. */
export function renderSection(run: EvalRun): string {
  const t = totals(run);
  const lines: string[] = [];
  lines.push(`## ${runDate(run)}: ${run.model}`);
  lines.push("");
  lines.push(
    `Run at ${run.at} (UTC). ${run.calls} live call${run.calls === 1 ? "" : "s"}, ${secs(run.totalMs)} in total. No fallback model.`,
  );
  lines.push("");
  lines.push(`**${t.fieldsCorrect} of ${t.fieldsTotal} fields correct.** Discount clause caught ${t.discountCaught} of ${t.discountPresent}. Late fee caught ${t.lateFeeCaught} of ${t.lateFeePresent}. False alarms: ${t.falseAlarms}. Quotes exact on ${t.evidenceExact} of ${t.invoices} invoices. Wrong answers marked "high" confidence: ${t.wrongButHigh}.${t.failedCalls ? ` **${t.failedCalls} call(s) failed.**` : ""}`);
  lines.push("");
  lines.push("| Invoice | Fields correct | Discount | Late fee | Quotes exact | Time | Confidence (high / medium / low) | Wrong but high |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const i of run.invoices) {
    const s = i.score;
    lines.push(
      `| ${i.name} | ${s.fieldsCorrect}/${s.fieldsTotal} | ${clause(s.discount)} | ${clause(s.lateFee)} | ${i.ok ? (s.evidenceAllExact ? "yes" : `NO (${s.evidenceBad.join(", ")})`) : "n/a"} | ${secs(i.ms)} | ${s.confidence.high} / ${s.confidence.medium} / ${s.confidence.low} | ${s.wrongButHigh} |`,
    );
  }
  const misses = run.invoices.flatMap((i) => i.score.fields.filter((f) => !f.correct).map((f) => ({ i, f })));
  const badQuotes = run.invoices.flatMap((i) => i.score.fields.filter((f) => f.evidenceExact === false).map((f) => ({ i, f })));
  const failed = run.invoices.filter((i) => !i.ok);
  if (failed.length) {
    lines.push("", "**Failed calls**", "");
    for (const i of failed) lines.push(`- ${i.name}: ${i.error ?? "failed"}`);
  }
  if (misses.length) {
    lines.push("", "**Fields it got wrong**", "");
    for (const { i, f } of misses) {
      lines.push(`- ${i.name}, ${f.key}: expected ${show(f.expected)}, got ${show(f.got)} (${f.confidence} confidence)`);
    }
  }
  if (badQuotes.length) {
    lines.push("", "**Quotes that are not in the invoice**", "");
    for (const { i, f } of badQuotes) lines.push(`- ${i.name}, ${f.key}: quoted ${show(f.evidence)}`);
  }
  if (!misses.length && !badQuotes.length && !failed.length) lines.push("", "No wrong fields and no inexact quotes.");
  lines.push("");
  return lines.join("\n");
}

/** The comparison table. Uses the latest run of each model. Says what is missing until there are two models. */
export function renderSummary(runs: EvalRun[]): string {
  const latest = new Map<string, EvalRun>();
  for (const r of [...runs].sort((a, b) => a.at.localeCompare(b.at))) latest.set(r.model, r);
  const models = [...latest.values()];
  if (models.length < 2) {
    return `Only ${models.length === 1 ? `\`${models[0].model}\`` : "no model"} has been run so far. The comparison table appears here once a second model has run.`;
  }
  const rows = models.map((r) => ({ r, t: totals(r) }));
  const lines = [
    "| Measure | " + rows.map(({ r }) => `\`${r.model}\``).join(" | ") + " |",
    "|---|" + rows.map(() => "---").join("|") + "|",
    `| Run on | ${rows.map(({ r }) => runDate(r)).join(" | ")} |`,
    `| Fields correct | ${rows.map(({ t }) => `${t.fieldsCorrect}/${t.fieldsTotal}`).join(" | ")} |`,
    `| Discount clause caught | ${rows.map(({ t }) => `${t.discountCaught}/${t.discountPresent}`).join(" | ")} |`,
    `| Late fee caught | ${rows.map(({ t }) => `${t.lateFeeCaught}/${t.lateFeePresent}`).join(" | ")} |`,
    `| False alarms (invented a clause) | ${rows.map(({ t }) => t.falseAlarms).join(" | ")} |`,
    `| Invoices with every quote exact | ${rows.map(({ t }) => `${t.evidenceExact}/${t.invoices}`).join(" | ")} |`,
    `| Wrong answers marked "high" confidence | ${rows.map(({ t }) => t.wrongButHigh).join(" | ")} |`,
    `| Average time per invoice | ${rows.map(({ t }) => secs(t.avgMs)).join(" | ")} |`,
    `| Failed calls | ${rows.map(({ t }) => t.failedCalls).join(" | ")} |`,
  ];
  return lines.join("\n");
}

// ---------- the document ----------

export const SUMMARY_START = "<!-- SUMMARY:START -->";
export const SUMMARY_END = "<!-- SUMMARY:END -->";

export const EVAL_HEADER = `# Invoice reading: model evaluation

How well does each model read a supplier invoice? Five synthetic invoices (no real data), each with a ground-truth answer written by hand in \`eval/ground-truth/\`. Run it with:

\`\`\`bash
npm run eval:extract -- --model gemini-3.5-flash-lite
\`\`\`

It makes one live call per invoice (5 in all), with no fallback model and no retry on another model, then appends a dated section below. Once two different models have run, the comparison table below fills in.

## The five invoices

| Invoice | What it tests |
|---|---|
| \`invoice-clean.pdf\` | The baseline: a clean PDF with everything printed plainly. |
| \`invoice-photo.png\` | The same invoice photographed at an angle: how much a poor photo costs. |
| \`invoice-hidden-discount.pdf\` | A 2.5% / 5-day early-payment discount buried in tiny footer terms. |
| \`invoice-latefee.pdf\` | A late fee only, two line items, and terms ("due within 15 days") instead of a due date. |
| \`invoice-hindi-mixed.png\` | Hindi and English labels, handwritten-looking, DD-MM-YYYY dates. |

## How it is scored

Ten fields per invoice (supplier, invoice number, invoice date, due date, total, quantity, unit price, discount %, discount days, late fee % per month), so 50 in all.

- **A field is correct** if it equals the ground truth exactly. Names ignore case and punctuation. When the invoice does not state a field, the **right answer is null**: filling it in is wrong. Three are deliberately null on \`invoice-latefee.pdf\`: the due date (only terms are printed, and the product never works a date out), the unit price (two items, two prices) and both discount fields (there is no discount).
- **A clause is caught** if every field of it is right: discount means both the percent and the days; late fee means the percent per month. Inventing a clause an invoice does not have is a **false alarm**.
- **Quotes exact** means every value the model returned came with a quote that really appears in the printed text of the invoice (ignoring case and spacing).
- **Wrong but high** counts wrong answers the model marked "high" confidence. They are the dangerous ones: the founder confirms every field, but a confident error is easy to miss.
- **Time** is the wall-clock time of the call.

Limits: five invoices, all synthetic and all about shoes, one run per model, and models do not answer identically each time. Treat the numbers as a first signal, not a benchmark.

## Comparison

${SUMMARY_START}
${SUMMARY_END}

# Runs

Newest last.
`;

/** Put the summary between its markers, and append the new section at the end. Creates the document if it is missing. */
export function updateEvalDoc(existing: string | null, section: string, summary: string): string {
  let doc = existing && existing.includes(SUMMARY_START) && existing.includes(SUMMARY_END) ? existing : EVAL_HEADER;
  doc = doc.replace(new RegExp(`${SUMMARY_START}[\\s\\S]*?${SUMMARY_END}`), `${SUMMARY_START}\n${summary}\n${SUMMARY_END}`);
  return `${doc.replace(/\s+$/, "")}\n\n${section.replace(/\s+$/, "")}\n`;
}
