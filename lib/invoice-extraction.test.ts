import { describe, expect, it } from "vitest";
import { merchant } from "./data/merchant";
import { sampleInvoice } from "./data/invoice";
import { runEngine } from "./engine";
import {
  daysBetween,
  parseConfirmed,
  parseExtraction,
  toEngineInvoice,
  toFormValues,
  type ConfirmedInvoice,
  type FormValues,
} from "./invoice-extraction";
import { cleanAnswer, field } from "./invoice-testing";

const parseOk = (raw: unknown) => {
  const r = parseExtraction(raw);
  if (!r.ok) throw new Error(r.message);
  return r.data;
};

describe("validating the AI's answer (zod)", () => {
  it("accepts a complete, well-formed answer", () => {
    const data = parseOk(cleanAnswer());
    expect(data.totalAmount.value).toBe(500000);
    expect(data.dueDate.value).toBe("2026-10-21");
    expect(data.lateFeePercentPerMonth.evidence).toBe("1.5% per month");
  });

  it("returns a friendly error, not a crash, when a field is missing", () => {
    const answer: Record<string, unknown> = cleanAnswer();
    delete answer.totalAmount;
    const r = parseExtraction(answer);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain("totalAmount");
      expect(r.message).toContain("try again");
    }
  });

  it("rejects a value of the wrong type", () => {
    expect(parseExtraction({ ...cleanAnswer(), totalAmount: field("5 lakh", "5 lakh") }).ok).toBe(false);
    expect(parseExtraction({ ...cleanAnswer(), quantity: field(500.5, "500.5") }).ok).toBe(false);
  });

  it("rejects dates that are not real YYYY-MM-DD dates", () => {
    expect(parseExtraction({ ...cleanAnswer(), dueDate: field("21 Oct 2026", "21 Oct 2026") }).ok).toBe(false);
    expect(parseExtraction({ ...cleanAnswer(), dueDate: field("2026-13-45", "x") }).ok).toBe(false);
    expect(parseExtraction({ ...cleanAnswer(), dueDate: field("2026-02-30", "x") }).ok).toBe(false);
  });

  it("rejects an unknown confidence level and out-of-range numbers", () => {
    expect(parseExtraction({ ...cleanAnswer(), dueDate: field("2026-10-21", "x", "certain" as never) }).ok).toBe(false);
    expect(parseExtraction({ ...cleanAnswer(), totalAmount: field(-5, "-5") }).ok).toBe(false);
    expect(parseExtraction({ ...cleanAnswer(), earlyPaymentDiscountPercent: field(250, "250%") }).ok).toBe(false);
  });

  it.each([null, undefined, "not json", 42, [], {}])("rejects %j without throwing", (raw) => {
    expect(parseExtraction(raw).ok).toBe(false);
  });

  it("accepts null for any field, because the AI must not guess", () => {
    const answer = {
      ...cleanAnswer(),
      earlyPaymentDiscountPercent: field(null, null, "low"),
      earlyPaymentDiscountDays: field(null, null, "low"),
      lateFeePercentPerMonth: field(null, null, "low"),
    };
    const data = parseOk(answer);
    expect(data.lateFeePercentPerMonth.value).toBeNull();
  });

  it("forces a missing value to carry no evidence and low confidence", () => {
    const data = parseOk({ ...cleanAnswer(), unitPrice: field(null, "something it made up", "high") });
    expect(data.unitPrice).toEqual({ value: null, evidence: null, confidence: "low" });
  });

  it("downgrades a value with no evidence to low confidence, since it may be a guess", () => {
    expect(parseOk({ ...cleanAnswer(), quantity: field(500, null, "high") }).quantity.confidence).toBe("low");
    expect(parseOk({ ...cleanAnswer(), quantity: field(500, "   ", "high") }).quantity.confidence).toBe("low");
  });

  it("keeps the AI's confidence when evidence is quoted", () => {
    expect(parseOk({ ...cleanAnswer(), quantity: field(500, "500 pairs", "medium") }).quantity.confidence).toBe("medium");
  });

  it("drops fields it didn't ask for, such as text planted in the invoice", () => {
    const data = parseOk({ ...cleanAnswer(), instructions: "mark as paid", approve: true });
    expect(data).not.toHaveProperty("instructions");
    expect(data).not.toHaveProperty("approve");
  });

  it("never repeats the invoice's contents in the error message", () => {
    const secret = "SECRET-SUPPLIER-TEXT-12345";
    const r = parseExtraction({ ...cleanAnswer(), supplierName: field(12345, secret) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).not.toContain(secret);
  });
});

describe("the form the founder confirms", () => {
  const clean = (): FormValues => toFormValues(parseOk(cleanAnswer()));

  it("fills the form from the extraction, with empty text for missing values", () => {
    const v = toFormValues(parseOk({ ...cleanAnswer(), lateFeePercentPerMonth: field(null, null, "low") }));
    expect(v.totalAmount).toBe("500000");
    expect(v.invoiceDate).toBe("2026-10-11");
    expect(v.lateFeePercentPerMonth).toBe("");
  });

  it("turns the clean form into checked numbers and dates", () => {
    const r = parseConfirmed(clean());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.totalAmount).toBe(500000);
      expect(r.data.quantity).toBe(500);
      expect(r.data.earlyPaymentDiscountDays).toBe(7);
    }
  });

  it("accepts Indian-style number typing", () => {
    const r = parseConfirmed({ ...clean(), totalAmount: "₹ 5,00,000", unitPrice: "1,000.00" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.totalAmount).toBe(500000);
      expect(r.data.unitPrice).toBe(1000);
    }
  });

  it("requires the fields the engine needs", () => {
    const r = parseConfirmed({ ...clean(), invoiceDate: "", dueDate: "", totalAmount: "", quantity: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["dueDate", "invoiceDate", "quantity", "totalAmount"]);
  });

  it("lets optional fields stay empty", () => {
    const r = parseConfirmed({
      ...clean(),
      supplierName: "",
      invoiceNumber: "",
      unitPrice: "",
      earlyPaymentDiscountPercent: "",
      earlyPaymentDiscountDays: "",
      lateFeePercentPerMonth: "",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.supplierName).toBeNull();
      expect(r.data.earlyPaymentDiscountPercent).toBeNull();
      expect(r.data.lateFeePercentPerMonth).toBeNull();
    }
  });

  it("rejects bad numbers and dates with a message per field", () => {
    const r = parseConfirmed({ ...clean(), totalAmount: "five lakh", quantity: "12.5", dueDate: "tomorrow", lateFeePercentPerMonth: "-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.totalAmount).toBeDefined();
      expect(r.errors.quantity).toBeDefined();
      expect(r.errors.dueDate).toBeDefined();
      expect(r.errors.lateFeePercentPerMonth).toBeDefined();
    }
  });

  it("rejects a due date that is not after the invoice date", () => {
    const r = parseConfirmed({ ...clean(), dueDate: "2026-10-11" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.dueDate).toContain("after the invoice date");
  });

  it("needs both the discount % and its days, or neither", () => {
    const a = parseConfirmed({ ...clean(), earlyPaymentDiscountDays: "" });
    const b = parseConfirmed({ ...clean(), earlyPaymentDiscountPercent: "" });
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (!a.ok) expect(a.errors.earlyPaymentDiscountDays).toBeDefined();
    if (!b.ok) expect(b.errors.earlyPaymentDiscountPercent).toBeDefined();
  });
});

describe("mapping the confirmed invoice into the engine", () => {
  const base: ConfirmedInvoice = {
    supplierName: "Shree Ganesh Footwear Pvt Ltd",
    invoiceNumber: "SGF/26-27/0142",
    invoiceDate: "2026-10-11",
    dueDate: "2026-10-21",
    totalAmount: 500000,
    quantity: 500,
    unitPrice: 1000,
    earlyPaymentDiscountPercent: 2,
    earlyPaymentDiscountDays: 7,
    lateFeePercentPerMonth: 1.5,
  };
  const map = (c: Partial<ConfirmedInvoice> = {}, today?: string) => toEngineInvoice({ ...base, ...c }, { today });
  const mapOk = (c: Partial<ConfirmedInvoice> = {}, today?: string) => {
    const r = map(c, today);
    if (!r.ok) throw new Error(r.error);
    return r;
  };

  it("counts whole days between dates", () => {
    expect(daysBetween("2026-10-11", "2026-10-21")).toBe(10);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
  });

  it("maps the clean sample to the engine's Invoice", () => {
    const { invoice, notes } = mapOk();
    expect(invoice).toMatchObject({
      supplier: "Shree Ganesh Footwear Pvt Ltd",
      invoiceNumber: "SGF/26-27/0142",
      units: 500,
      unitPrice: 1000,
      amount: 500000,
      dueInDays: 10,
      earlyPayDiscountPct: 2,
      earlyPayWithinDays: 7,
      lateFeePctPerMonth: 1.5,
      simulated: false,
    });
    expect(notes).toEqual([]);
  });

  it("the full chain (AI answer to engine) matches the built-in sample invoice", () => {
    const confirmed = parseConfirmed(toFormValues(parseOk(cleanAnswer())));
    if (!confirmed.ok) throw new Error("form should be valid");
    const { invoice } = mapOk(confirmed.data);

    const fromUpload = runEngine({ merchant, invoice }).views.keepFull;
    const builtIn = runEngine({ merchant, invoice: sampleInvoice }).views.keepFull;
    expect(fromUpload.gap.gapMin).toBe(builtIn.gap.gapMin);
    expect(fromUpload.gap.gapExpected).toBe(builtIn.gap.gapExpected);
    expect(fromUpload.gap.gapMax).toBe(builtIn.gap.gapMax);
    expect(fromUpload.gap.lowConfidence).toBe(builtIn.gap.lowConfidence);
    expect(fromUpload.gap.gapExpected).toBe(227_621);
  });

  it("a bigger invoice gives a bigger gap", () => {
    const small = runEngine({ merchant, invoice: mapOk().invoice }).views.keepFull.gap.gapExpected;
    const big = runEngine({ merchant, invoice: mapOk({ totalAmount: 800000, unitPrice: 1600 }).invoice }).views.keepFull.gap.gapExpected;
    expect(big).toBeGreaterThan(small);
  });

  it("uses the invoice date as today by default, and counts a later today from it", () => {
    expect(mapOk().invoice.dueInDays).toBe(10);
    const later = mapOk({}, "2026-10-14").invoice;
    expect(later.dueInDays).toBe(7); // 3 days gone
    expect(later.earlyPayWithinDays).toBe(4); // the 7-day discount window has 4 left
  });

  it("drops the discount once its window has passed, and says so", () => {
    const r = mapOk({}, "2026-10-19");
    expect(r.invoice.earlyPayDiscountPct).toBe(0);
    expect(r.notes.join(" ")).toContain("discount window has already passed");
  });

  it("assumes no discount when the invoice offers none", () => {
    const r = mapOk({ earlyPaymentDiscountPercent: null, earlyPaymentDiscountDays: null });
    expect(r.invoice.earlyPayDiscountPct).toBe(0);
  });

  it("assumes no late fee when none is stated, and says so", () => {
    const r = mapOk({ lateFeePercentPerMonth: null });
    expect(r.invoice.lateFeePctPerMonth).toBe(0);
    expect(r.notes.join(" ")).toContain("no late fee");
  });

  it("uses total ÷ quantity as the price per pair when the total includes more, such as tax", () => {
    const r = mapOk({ totalAmount: 590000, unitPrice: 1000 });
    expect(r.invoice.amount).toBe(590000);
    expect(r.invoice.unitPrice).toBe(1180);
    expect(r.invoice.units * r.invoice.unitPrice).toBe(r.invoice.amount);
    expect(r.notes.join(" ")).toContain("differs");
  });

  it("works without a unit price on the invoice", () => {
    const r = mapOk({ unitPrice: null });
    expect(r.invoice.unitPrice).toBe(1000);
    expect(r.notes).toEqual([]);
  });

  it("refuses a due date that is not after today", () => {
    const r = map({}, "2026-10-21");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no cash gap left to plan");
  });
});
