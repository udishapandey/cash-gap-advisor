import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EVAL_HEADER,
  SUMMARY_END,
  SUMMARY_START,
  evidenceExact,
  failedScore,
  localDate,
  runDate,
  fieldCorrect,
  renderSection,
  renderSummary,
  scoreInvoice,
  squash,
  totals,
  updateEvalDoc,
  type EvalRun,
  type Extracted,
  type GroundTruth,
  type InvoiceRun,
} from "./eval-extract";
import { FIELD_KEYS, type FieldKey } from "./invoice-extraction";
import { sniffMimeType } from "./invoice-upload";

const NAMES = ["invoice-clean", "invoice-photo", "invoice-hidden-discount", "invoice-latefee", "invoice-hindi-mixed"];
type Truth = GroundTruth & { printedText: string };
const truthOf = (name: string) => JSON.parse(readFileSync(`eval/ground-truth/${name}.json`, "utf8")) as Truth;
const printedOf = (name: string) => readFileSync(truthOf(name).printedText, "utf8");

/** A model that answers exactly the ground truth, quoting a snippet we pass in for each field. */
const perfect = (truth: GroundTruth, evidence: Partial<Record<FieldKey, string>> = {}): Record<FieldKey, Extracted> =>
  Object.fromEntries(
    FIELD_KEYS.map((k) => [k, { value: truth.fields[k], evidence: truth.fields[k] === null ? null : (evidence[k] ?? String(truth.fields[k])), confidence: "high" as const }]),
  ) as Record<FieldKey, Extracted>;

const clean = truthOf("invoice-clean");
const cleanPrinted = printedOf("invoice-clean");
const withField = (base: Record<FieldKey, Extracted>, key: FieldKey, patch: Partial<Extracted>) => ({ ...base, [key]: { ...base[key], ...patch } });

describe("comparing a field with the ground truth", () => {
  it("numbers must match exactly", () => {
    expect(fieldCorrect("totalAmount", 500000, clean)).toBe(true);
    expect(fieldCorrect("totalAmount", 500001, clean)).toBe(false);
    expect(fieldCorrect("totalAmount", "500000", clean)).toBe(false);
    expect(fieldCorrect("lateFeePercentPerMonth", 1.5, clean)).toBe(true);
    expect(fieldCorrect("lateFeePercentPerMonth", 1.6, clean)).toBe(false);
  });
  it("dates must be exactly YYYY-MM-DD", () => {
    expect(fieldCorrect("dueDate", "2026-10-21", clean)).toBe(true);
    expect(fieldCorrect("dueDate", "2026-21-10", clean)).toBe(false);
    expect(fieldCorrect("dueDate", "21 Oct 2026", clean)).toBe(false);
  });
  it("names ignore case, spacing and punctuation", () => {
    expect(fieldCorrect("supplierName", "shree ganesh footwear pvt. ltd", clean)).toBe(true);
    expect(fieldCorrect("supplierName", "Shree Ganesh Footwear", clean)).toBe(false);
    expect(fieldCorrect("invoiceNumber", "sgf/26-27/0142", clean)).toBe(true);
  });
  it("accepts another spelling only when the ground truth lists it", () => {
    const hindi = truthOf("invoice-hindi-mixed");
    expect(fieldCorrect("supplierName", "Shri Laxmi Footwear", hindi)).toBe(true);
    expect(fieldCorrect("supplierName", "श्री लक्ष्मी फुटवियर", hindi)).toBe(true);
    expect(fieldCorrect("supplierName", "श्री लक्ष्मी", hindi)).toBe(false);
    expect(fieldCorrect("supplierName", "Shree Ganesh Footwear Pvt Ltd", hindi)).toBe(false);
  });
  it("when the invoice does not state a field, only null is right", () => {
    const late = truthOf("invoice-latefee");
    expect(late.fields.dueDate).toBeNull();
    expect(fieldCorrect("dueDate", null, late)).toBe(true);
    expect(fieldCorrect("dueDate", "2026-10-27", late)).toBe(false); // working a date out from the terms is wrong
    expect(fieldCorrect("unitPrice", 900, late)).toBe(false);
    expect(fieldCorrect("earlyPaymentDiscountPercent", 2, late)).toBe(false);
    expect(fieldCorrect("earlyPaymentDiscountPercent", null, late)).toBe(true);
  });
  it("null is never right when the invoice does state the field", () => {
    for (const k of FIELD_KEYS) expect(fieldCorrect(k, null, clean)).toBe(false);
  });
});

describe("is a quote really in the invoice?", () => {
  it("finds an exact quote, whatever the case or spacing", () => {
    expect(evidenceExact("5,00,000.00", cleanPrinted)).toBe(true);
    expect(evidenceExact("11 OCT 2026", cleanPrinted)).toBe(true);
    expect(evidenceExact("500   pairs", cleanPrinted)).toBe(true);
    expect(evidenceExact("2% discount if paid within 7 days of invoice date", cleanPrinted)).toBe(true);
  });
  it("rejects a misread or invented quote", () => {
    expect(evidenceExact("5,000,00.00", cleanPrinted)).toBe(false); // the live photo run misread this
    expect(evidenceExact("12 Oct 2026", cleanPrinted)).toBe(false);
    expect(evidenceExact("", cleanPrinted)).toBe(false);
  });
  it("squash makes one form of each character", () => {
    expect(squash("  A\n\tB ")).toBe("a b");
  });
});

describe("scoring one invoice", () => {
  it("a perfect answer scores 10 of 10, every clause caught, every quote exact", () => {
    const s = scoreInvoice(
      perfect(clean, { supplierName: "Shree Ganesh Footwear Pvt Ltd", invoiceNumber: "SGF/26-27/0142", invoiceDate: "11 Oct 2026", dueDate: "21 Oct 2026", totalAmount: "5,00,000.00", quantity: "500 pairs", unitPrice: "1,000.00", earlyPaymentDiscountPercent: "2% discount", earlyPaymentDiscountDays: "within 7 days", lateFeePercentPerMonth: "1.5% per month" }),
      clean,
      cleanPrinted,
    );
    expect(s.fieldsCorrect).toBe(10);
    expect(s.discount).toEqual({ present: true, outcome: "caught" });
    expect(s.lateFee).toEqual({ present: true, outcome: "caught" });
    expect(s.evidenceAllExact).toBe(true);
    expect(s.evidenceChecked).toBe(10);
    expect(s.wrongButHigh).toBe(0);
    expect(s.confidence).toEqual({ high: 10, medium: 0, low: 0 });
  });

  it("counts the fields it got wrong, and the wrong ones it was confident about", () => {
    const base = perfect(clean, { totalAmount: "5,00,000.00", quantity: "500 pairs" });
    const wrong = withField(withField(base, "totalAmount", { value: 50000 }), "quantity", { value: 400, confidence: "low" });
    const s = scoreInvoice(wrong, clean, cleanPrinted);
    expect(s.fieldsCorrect).toBe(8);
    expect(s.wrongButHigh).toBe(1); // the total was wrong and marked high; the quantity was wrong but marked low
    expect(s.fields.find((f) => f.key === "totalAmount")).toMatchObject({ correct: false, expected: 500000, got: 50000 });
  });

  it("a discount is only caught when BOTH the percent and the days are right", () => {
    const base = perfect(clean);
    expect(scoreInvoice(withField(base, "earlyPaymentDiscountDays", { value: 10 }), clean, cleanPrinted).discount.outcome).toBe("missed");
    expect(scoreInvoice(withField(base, "earlyPaymentDiscountPercent", { value: null, evidence: null }), clean, cleanPrinted).discount.outcome).toBe("missed");
  });

  it("flags a clause the invoice does not have as a false alarm", () => {
    const late = truthOf("invoice-latefee");
    const printed = printedOf("invoice-latefee");
    const honest = scoreInvoice(perfect(late, { supplierName: "Bharat Sole & Sports Pvt Ltd" }), late, printed);
    expect(honest.discount).toEqual({ present: false, outcome: "correctly_none" });
    const invented = withField(withField(perfect(late), "earlyPaymentDiscountPercent", { value: 2, evidence: "2%" }), "earlyPaymentDiscountDays", { value: 10, evidence: "10 days" });
    const s = scoreInvoice(invented, late, printed);
    expect(s.discount.outcome).toBe("false_alarm");
    expect(s.fieldsCorrect).toBe(8);
  });

  it("calls a quote that is not in the invoice inexact, and names the field", () => {
    const s = scoreInvoice(perfect(clean, { totalAmount: "5,000,00.00" }), clean, cleanPrinted);
    expect(s.evidenceAllExact).toBe(false);
    expect(s.evidenceBad).toContain("totalAmount");
    expect(s.fields.find((f) => f.key === "totalAmount")?.evidenceExact).toBe(false);
  });

  it("a value with no quote at all is not an exact quote; a null with no quote needs none", () => {
    const base = perfect(clean, { totalAmount: "5,00,000.00" });
    expect(scoreInvoice(withField(base, "totalAmount", { evidence: null }), clean, cleanPrinted).evidenceBad).toContain("totalAmount");
    const late = truthOf("invoice-latefee");
    const s = scoreInvoice(perfect(late), late, printedOf("invoice-latefee"));
    expect(s.fields.find((f) => f.key === "dueDate")?.evidenceExact).toBeNull();
    expect(s.evidenceChecked).toBe(6); // only the six fields that have a value (the other four are null)
  });

  it("a failed call scores every field wrong and gives no credit for null fields", () => {
    const late = truthOf("invoice-latefee");
    const f = failedScore(late);
    expect(f.fieldsCorrect).toBe(0);
    expect(f.fieldsTotal).toBe(10);
    expect(f.lateFee.outcome).toBe("missed");
    expect(f.discount.outcome).toBe("correctly_none");
  });
});

describe("the ground truth and the sample files", () => {
  it.each(NAMES)("%s: has all ten fields, its file, and its printed text", (name) => {
    const t = truthOf(name);
    expect(Object.keys(t.fields).sort()).toEqual([...FIELD_KEYS].sort());
    expect(existsSync(t.file)).toBe(true);
    expect(existsSync(t.printedText)).toBe(true);
    expect(t.layout.length).toBeGreaterThan(20);
    for (const k of FIELD_KEYS) expect(["string", "number", "object"]).toContain(typeof t.fields[k]);
  });

  it.each(NAMES)("%s: the real file is a PDF or PNG, under the 5 MB upload limit", (name) => {
    const t = truthOf(name);
    const bytes = new Uint8Array(readFileSync(t.file));
    expect(sniffMimeType(bytes)).toBe(t.file.endsWith(".pdf") ? "application/pdf" : "image/png");
    expect(statSync(t.file).size).toBeLessThan(5 * 1024 * 1024);
  });

  it.each(NAMES)("%s: the answers agree with what is printed", (name) => {
    const t = truthOf(name);
    const printed = squash(printedOf(name));
    for (const k of ["supplierName", "invoiceNumber"] as const) {
      const options = [t.fields[k] as string, ...(t.alsoAccept?.[k] ?? [])].map(squash);
      expect(options.some((o) => printed.includes(o)), `${name} ${k}`).toBe(true);
    }
    // A total and a quantity that are stated must appear (in Indian grouping for the total).
    expect(printed).toContain((t.fields.totalAmount as number).toLocaleString("en-IN"));
    expect(printed).toContain(String(t.fields.quantity));
    // The late fee and discount percentages appear next to a % sign when the invoice states them.
    if (t.fields.lateFeePercentPerMonth !== null) expect(printed).toContain(`${t.fields.lateFeePercentPerMonth}%`);
    if (t.fields.earlyPaymentDiscountPercent !== null) expect(printed).toContain(`${t.fields.earlyPaymentDiscountPercent}%`);
  });

  it("the late-fee invoice states no discount and no due date, and has two line items", () => {
    const printed = squash(printedOf("invoice-latefee"));
    expect(printed).not.toContain("discount");
    expect(printed).not.toMatch(/due date/);
    expect(printed).toContain("due within 15 days");
    expect(printed).toContain("running shoe");
    expect(printed).toContain("rubber slipper");
  });

  it("the hidden-discount invoice has the discount only in the footer terms", () => {
    const lines = printedOf("invoice-hidden-discount").split("\n");
    const mentions = lines.filter((l) => /discount/i.test(l));
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toContain("2.5%");
    expect(lines.indexOf(mentions[0])).toBeGreaterThan(lines.findIndex((l) => l.includes("Terms & conditions")));
  });

  it("the Hindi invoice mixes both scripts", () => {
    const printed = printedOf("invoice-hindi-mixed");
    expect(printed).toMatch(/[ऀ-ॿ]/);
    expect(printed).toMatch(/[A-Za-z]/);
    expect(printed).toContain("12-10-2026");
  });

  it("the five answers are different invoices", () => {
    const keys = NAMES.map((n) => `${truthOf(n).fields.supplierName}|${truthOf(n).fields.invoiceNumber}`);
    expect(new Set(keys).size).toBe(4); // clean and photo are the same invoice on purpose
    expect(truthOf("invoice-clean").fields).toEqual(truthOf("invoice-photo").fields);
  });
});

// ---------- the report ----------

/** A flawless run: every answer right and every quote exact (the fixture marks quotes exact instead of inventing them). */
const flawless = (name: string) => {
  const t = truthOf(name);
  const s = scoreInvoice(perfect(t), t, printedOf(name));
  return { ...s, evidenceAllExact: true, evidenceBad: [], fields: s.fields.map((f) => ({ ...f, evidenceExact: f.got === null ? null : true })) };
};
const invoiceRun = (name: string, patch: Partial<InvoiceRun> = {}): InvoiceRun => {
  const t = truthOf(name);
  return { name, file: t.file, layout: t.layout, ok: true, ms: 2500, modelUsed: "m", score: flawless(name), ...patch };
};
const run = (model: string, at: string, invoices: InvoiceRun[]): EvalRun => ({ model, at, calls: invoices.length, totalMs: 12_000, invoices });

describe("the report", () => {
  const good = run("model-a", "2026-10-12T10:00:00.000Z", NAMES.map((n) => invoiceRun(n)));

  it("adds up the totals", () => {
    const t = totals(good);
    expect(t.fieldsTotal).toBe(50);
    expect(t.discountPresent).toBe(4); // every invoice except the late-fee one states a discount
    expect(t.lateFeePresent).toBe(5);
    expect(t.avgMs).toBe(2500);
    expect(t.failedCalls).toBe(0);
  });

  it("a section names the model and date, and lists what it got wrong", () => {
    const late = truthOf("invoice-latefee");
    const wrong = scoreInvoice(withField(perfect(late), "dueDate", { value: "2026-10-27", evidence: "15 days" }), late, printedOf("invoice-latefee"));
    const text = renderSection(run("model-a", "2026-10-12T10:00:00.000Z", [invoiceRun("invoice-clean"), invoiceRun("invoice-latefee", { score: wrong })]));
    expect(text).toContain("## 2026-10-12: model-a");
    expect(text).toContain("| invoice-latefee | 9/10 |");
    expect(text).toContain("invoice-latefee, dueDate: expected null, got \"2026-10-27\"");
    expect(text).toContain("Quotes that are not in the invoice");
    expect(text).toContain("2 live calls");
  });

  it("says plainly when there is nothing wrong, and when a call failed", () => {
    expect(renderSection(good)).toContain("No wrong fields and no inexact quotes.");
    const failed = invoiceRun("invoice-photo", { ok: false, error: "kind=provider_error http=503", score: failedScore(truthOf("invoice-photo")) });
    const text = renderSection(run("model-a", "2026-10-12T10:00:00.000Z", [failed]));
    expect(text).toContain("1 call(s) failed");
    expect(text).toContain("invoice-photo: kind=provider_error http=503");
    expect(text).toContain("| invoice-photo | 0/10 |");
  });

  it("the summary waits for a second model, then compares the latest run of each", () => {
    expect(renderSummary([])).toContain("no model");
    expect(renderSummary([good])).toContain("`model-a`");
    expect(renderSummary([good])).toContain("second model");
    const other = run("model-b", "2026-10-13T10:00:00.000Z", NAMES.map((n) => invoiceRun(n, { ms: 4000 })));
    const table = renderSummary([good, other]);
    expect(table).toContain("| Measure | `model-a` | `model-b` |");
    expect(table).toContain("| Fields correct | 50/50 | 50/50 |");
    expect(table).toContain("| Average time per invoice | 2.5s | 4.0s |");
    const newer = run("model-a", "2026-10-14T10:00:00.000Z", [invoiceRun("invoice-clean", { ms: 1000 })]);
    expect(renderSummary([good, other, newer])).toContain("| Fields correct | 10/10 | 50/50 |"); // the latest run of model-a
  });
});

describe("the document", () => {
  const a = run("model-a", "2026-10-12T10:00:00.000Z", [invoiceRun("invoice-clean")]);
  const b = run("model-b", "2026-10-13T10:00:00.000Z", [invoiceRun("invoice-clean")]);

  it("is created with an explanation and an empty summary when it does not exist yet", () => {
    const doc = updateEvalDoc(null, renderSection(a), renderSummary([a]));
    expect(doc).toContain("# Invoice reading: model evaluation");
    expect(doc).toContain("## How it is scored");
    expect(doc).toContain("## 2026-10-12: model-a");
    expect(doc.indexOf(SUMMARY_START)).toBeLessThan(doc.indexOf("## 2026-10-12: model-a"));
    expect(doc).toContain("second model");
  });

  it("appends one section per run, in order, and refreshes the summary in place", () => {
    const first = updateEvalDoc(null, renderSection(a), renderSummary([a]));
    const second = updateEvalDoc(first, renderSection(b), renderSummary([a, b]));
    expect(second.indexOf("## 2026-10-12: model-a")).toBeLessThan(second.indexOf("## 2026-10-13: model-b"));
    expect(second).toContain("| Measure | `model-a` | `model-b` |");
    expect(second).not.toContain("second model"); // the placeholder was replaced
    expect(second.split(SUMMARY_START)).toHaveLength(2);
    expect(second.split(SUMMARY_END)).toHaveLength(2);
    expect(second.split("## 2026-10-12: model-a")).toHaveLength(2); // the first section is not duplicated
  });

  it("starts from the explanation again if the markers were lost", () => {
    const doc = updateEvalDoc("hand edited, no markers", renderSection(a), renderSummary([a]));
    expect(doc).toContain(EVAL_HEADER.split("\n")[0]);
  });
});

describe("the date of a run", () => {
  it("uses the local calendar date when it was recorded, not the UTC date a day behind", () => {
    const r = { ...run("m", "2026-10-11T18:36:50.504Z", []), date: "2026-10-12" };
    expect(runDate(r)).toBe("2026-10-12");
    expect(runDate(run("m", "2026-10-11T18:36:50.504Z", []))).toBe("2026-10-11"); // older results without a local date
    expect(renderSection(r)).toContain("## 2026-10-12: m");
  });
  it("localDate is a plain YYYY-MM-DD for the local day", () => {
    expect(localDate(new Date(2026, 9, 12, 0, 6))).toBe("2026-10-12");
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
