import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evidenceExact, fieldCorrect, type GroundTruth } from "../eval-extract";
import { runEngine } from "../engine";
import { FIELD_KEYS, parseConfirmed, parseExtraction, toEngineInvoice, toFormValues } from "../invoice-extraction";
import { dayLabel, buildHeroPlan, compareRows, forecastSaving, gapView, homeAlert } from "../plain";
import { merchant } from "./merchant";
import { SAMPLE_BILLS, savedReadingFor } from "./sample-bills";

const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const bill2 = SAMPLE_BILLS[1];
const truth = JSON.parse(readFileSync("eval/ground-truth/sample-invoice-2-kaveri-soles.json", "utf8")) as GroundTruth & { printedText: string };
const printed = readFileSync(truth.printedText, "utf8");

describe("the two sample bills", () => {
  it("each recorded hash is the hash of its PDF, so an unchanged download is recognised", () => {
    for (const b of SAMPLE_BILLS) expect(sha(`public${b.href}`), b.id).toBe(b.sha256);
    expect(savedReadingFor(bill2.sha256)?.id).toBe("bill-2");
    expect(savedReadingFor("0".repeat(64))).toBeNull();
    expect(savedReadingFor(null)).toBeNull();
  });
  it("the download links are both PDFs under /samples, in the order Bill 1, Bill 2", () => {
    expect(SAMPLE_BILLS.map((b) => [b.label, b.href])).toEqual([
      ["Bill 1", "/samples/invoice-clean.pdf"],
      ["Bill 2", "/samples/sample-invoice-2-kaveri-soles.pdf"],
    ]);
  });
  it("both saved readings are valid extractions", () => {
    for (const b of SAMPLE_BILLS) expect(parseExtraction(b.extraction).ok, b.id).toBe(true);
  });
});

describe("bill 2: Kaveri Soles & Uppers", () => {
  it("the saved reading says what the ground truth says, field by field", () => {
    for (const k of FIELD_KEYS) expect(fieldCorrect(k, bill2.extraction[k].value, truth), k).toBe(true);
  });
  it("every quote in the saved reading is in the printed text", () => {
    for (const k of FIELD_KEYS) {
      const e = bill2.extraction[k].evidence;
      if (e !== null) expect(evidenceExact(e, printed), `${k}: ${e}`).toBe(true);
    }
  });
  it("leaves the late charge empty: it is printed per year and the reader never converts units", () => {
    expect(bill2.extraction.lateFeePercentPerMonth.value).toBeNull();
    expect(printed).toContain("18% per annum");
  });

  const form = parseConfirmed(toFormValues(bill2.extraction));
  const mapped = form.ok ? toEngineInvoice(form.data) : null;
  it("goes through the form and into the engine: ₹2,70,000, due in 45 days, 1.5% off within 15", () => {
    expect(form.ok).toBe(true);
    expect(mapped?.ok).toBe(true);
    if (!mapped?.ok) return;
    expect(mapped.invoice).toMatchObject({ amount: 270_000, units: 300, unitPrice: 900, dueInDays: 45, earlyPayDiscountPct: 1.5, earlyPayWithinDays: 15, startDate: "2026-10-14" });
  });

  it("plans sensibly: pay ₹2,65,950 on 29 Oct from cash alone, no borrowing, ₹4,050 saved", () => {
    if (!mapped?.ok) throw new Error("mapping failed");
    const r = runEngine({ merchant, invoice: mapped.invoice });
    const view = r.recommended;
    expect(view.recommended.timing).toBe("pay_early_for_discount");
    expect(view.discount).toMatchObject({ discountAmount: 4_050, netSaving: 4_050, worthIt: true });
    const plan = view.recommended.plan;
    expect(plan.payAmount).toBe(265_950);
    expect(plan.steps.map((s) => [s.optionId, s.amount, s.cost])).toEqual([["own_cash", 265_950, 0]]);
    expect(plan.totalCost).toBe(0);
    expect(plan.fullyCovered).toBe(true);
    const saving = forecastSaving(r, r.recommendedView, { salesDropPercent: 0, cashElsewhere: 0 });
    expect(saving).toBe(4_050);
    const hero = buildHeroPlan(r, r.recommendedView, saving);
    expect(hero.title).toBe("Pay early and keep ₹4,050");
    expect(hero.subtitle).toBe("Pay ₹2.66L by 29 Oct to get the ₹4,050 discount.");
    expect(hero.hasLoans).toBe(false);
    expect(hero.closingLine).toBeNull();
    expect(dayLabel(mapped.invoice, 45)).toBe("28 Nov");
    expect(homeAlert(r, saving).facts).toEqual([
      { label: "Bill", value: "₹2.70L", caption: "Due 28 Nov" },
      { label: "Cash needed", value: "None" },
      { label: "Financing cost", value: "₹0" },
    ]);
    expect(compareRows(r, r.recommendedView).find((x) => x.id === "early_settlement")?.covers).toBe("Not needed.");
    expect(gapView(r).headline).toBe("No cash shortfall");
    expect(gapView(r).dueLine).toBe("Paying on 28 Nov needs no borrowing.");
  });
});
