import { describe, expect, it } from "vitest";
import {
  UNMAPPABLE_MESSAGE,
  WHAT_IF_RANGES,
  applyWhatIf,
  clampWhatIf,
  describeSettings,
  isEmptyWhatIf,
  mockInterpret,
  normaliseQuestion,
  parseWhatIf,
  type WhatIfField,
} from "./whatif";

const OUT_OF_RANGE: [WhatIfField, number][] = [
  ["salesDropPercent", 50.1],
  ["salesDropPercent", 80],
  ["salesDropPercent", -1],
  ["supplierExtensionDays", 46],
  ["supplierExtensionDays", -1],
  ["cashElsewhere", 1_000_001],
  ["cashElsewhere", -5],
  ["bankRatePercent", 4.9],
  ["bankRatePercent", 37],
];
const IN_RANGE: [WhatIfField, number][] = [
  ["salesDropPercent", 0],
  ["salesDropPercent", 25],
  ["salesDropPercent", 50],
  ["supplierExtensionDays", 0],
  ["supplierExtensionDays", 45],
  ["cashElsewhere", 0],
  ["cashElsewhere", 1_000_000],
  ["bankRatePercent", 5],
  ["bankRatePercent", 36],
];

describe("checking what the AI returned", () => {
  it("accepts any of the four settings, alone or together", () => {
    expect(parseWhatIf({ salesDropPercent: 25 })).toEqual({ ok: true, settings: { salesDropPercent: 25 } });
    expect(parseWhatIf({ salesDropPercent: 10, supplierExtensionDays: 15, cashElsewhere: 50_000, bankRatePercent: 12 })).toEqual({
      ok: true,
      settings: { salesDropPercent: 10, supplierExtensionDays: 15, cashElsewhere: 50_000, bankRatePercent: 12 },
    });
  });

  it.each(IN_RANGE)("accepts %s = %d, the edge of its range included", (field, value) => {
    expect(parseWhatIf({ [field]: value })).toEqual({ ok: true, settings: { [field]: value } });
  });

  it.each(OUT_OF_RANGE)("REJECTS %s = %d, because it is outside its range", (field, value) => {
    const r = parseWhatIf({ [field]: value });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("out_of_range");
      expect(r.message).toContain("Out of range");
      expect(r.message).toContain(WHAT_IF_RANGES[field].label);
    }
  });

  it("rejects the whole answer if any one value is out of range, and applies none of it", () => {
    const r = parseWhatIf({ salesDropPercent: 25, bankRatePercent: 99 });
    expect(r.ok).toBe(false);
  });

  it("an empty object is fine: it means the question couldn't be mapped", () => {
    const r = parseWhatIf({});
    expect(r).toEqual({ ok: true, settings: {} });
    expect(isEmptyWhatIf((r as { settings: object }).settings)).toBe(true);
  });

  it("treats null as 'not mentioned'", () => {
    expect(parseWhatIf({ salesDropPercent: null, supplierExtensionDays: 15 })).toEqual({
      ok: true,
      settings: { supplierExtensionDays: 15 },
    });
  });

  it("drops fields it didn't ask for", () => {
    expect(parseWhatIf({ salesDropPercent: 10, approve: true, loanAmount: 99 })).toEqual({
      ok: true,
      settings: { salesDropPercent: 10 },
    });
  });

  it.each([null, undefined, "25%", 25, [], [{ salesDropPercent: 5 }], true])("rejects %j as not an object", (raw) => {
    const r = parseWhatIf(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid");
  });

  it.each([{ salesDropPercent: "25" }, { salesDropPercent: "25%" }, { cashElsewhere: "2 lakh" }, { bankRatePercent: NaN }, { supplierExtensionDays: Infinity }])(
    "rejects %j: the value is not a real number",
    (raw) => {
      expect(parseWhatIf(raw).ok).toBe(false);
    },
  );

  it("rounds to sensible steps: days and rupees whole, percentages to a tenth", () => {
    const r = parseWhatIf({ salesDropPercent: 25.26, supplierExtensionDays: 14.6, cashElsewhere: 49999.7, bankRatePercent: 12.34 });
    expect(r).toEqual({ ok: true, settings: { salesDropPercent: 25.3, supplierExtensionDays: 15, cashElsewhere: 50_000, bankRatePercent: 12.3 } });
  });
});

describe("clamping, the second line of defence", () => {
  it("pulls any value into its range", () => {
    expect(clampWhatIf({ salesDropPercent: 80, supplierExtensionDays: 90, cashElsewhere: 5_000_000, bankRatePercent: 1 })).toEqual({
      salesDropPercent: 50,
      supplierExtensionDays: 45,
      cashElsewhere: 1_000_000,
      bankRatePercent: 5,
    });
    expect(clampWhatIf({ salesDropPercent: -5, bankRatePercent: 99 })).toEqual({ salesDropPercent: 0, bankRatePercent: 36 });
  });
  it("leaves in-range values alone and drops anything that isn't a number", () => {
    expect(clampWhatIf({ salesDropPercent: 25 })).toEqual({ salesDropPercent: 25 });
    expect(clampWhatIf({ salesDropPercent: NaN } as never)).toEqual({});
  });
});

describe("applying settings", () => {
  it("maps each setting to the thing it changes", () => {
    expect(applyWhatIf({ salesDropPercent: 25, supplierExtensionDays: 15, cashElsewhere: 50_000, bankRatePercent: 12 })).toEqual({
      patch: { salesDropPercent: 25, cashElsewhere: 50_000, overdraftRatePct: 12 },
      extensionDays: 15,
    });
  });
  it("changes only what was mentioned", () => {
    expect(applyWhatIf({ supplierExtensionDays: 15 })).toEqual({ patch: {}, extensionDays: 15 });
    expect(applyWhatIf({ salesDropPercent: 10 })).toEqual({ patch: { salesDropPercent: 10 } });
  });
  it("never hands the engine an out-of-range value, even if called with one", () => {
    expect(applyWhatIf({ salesDropPercent: 500 }).patch.salesDropPercent).toBe(50);
  });
});

describe("the trace and the fallback message", () => {
  it("shows what the question was understood as", () => {
    expect(describeSettings({ salesDropPercent: 25 })).toBe("Applied: sales −25%");
    expect(describeSettings({ supplierExtensionDays: 15 })).toBe("Applied: supplier +15 days");
    expect(describeSettings({ salesDropPercent: 25, supplierExtensionDays: 15, cashElsewhere: 50_000, bankRatePercent: 12 })).toBe(
      "Applied: sales −25%, supplier +15 days, extra cash ₹50,000, bank rate 12%",
    );
    expect(describeSettings({ supplierExtensionDays: 0 })).toContain("no supplier extension");
    expect(describeSettings({ salesDropPercent: 0 })).toContain("sales unchanged");
  });
  it("the message for a question we can't map is exactly as specified", () => {
    expect(UNMAPPABLE_MESSAGE).toBe("Try a what-if about sales, supplier days, extra cash or the bank rate.");
  });
  it("treats questions that differ only in case and spacing as the same", () => {
    expect(normaliseQuestion("  What if   SALES drop 25%? ")).toBe(normaliseQuestion("what if sales drop 25%?"));
  });
});

describe("the mock reader (AI_MOCK=true)", () => {
  const read = (q: string) => mockInterpret(q);
  it("reads a sales drop in several wordings", () => {
    expect(read("What if sales drop 25%?")).toEqual({ salesDropPercent: 25 });
    expect(read("what if sales fall by 10 percent")).toEqual({ salesDropPercent: 10 });
    expect(read("What if there is a 30% drop in sales?")).toEqual({ salesDropPercent: 30 });
    expect(read("sales are 20% lower")).toEqual({ salesDropPercent: 20 });
  });
  it("reads extra supplier days", () => {
    expect(read("What if the supplier gives 15 more days?")).toEqual({ supplierExtensionDays: 15 });
    expect(read("supplier agrees to a 7 day extension")).toEqual({ supplierExtensionDays: 7 });
  });
  it("reads extra cash, including lakh and Indian commas", () => {
    expect(read("What if I add ₹50,000 extra cash?")).toEqual({ cashElsewhere: 50_000 });
    expect(read("what if I have Rs 2 lakh in savings")).toEqual({ cashElsewhere: 200_000 });
  });
  it("reads a bank rate", () => {
    expect(read("What if my bank rate is 12%?")).toEqual({ bankRatePercent: 12 });
    expect(read("what if the overdraft rate is 18 percent")).toEqual({ bankRatePercent: 18 });
  });
  it("reads several things in one question", () => {
    expect(read("What if sales drop 20% and the supplier gives 10 more days?")).toEqual({
      salesDropPercent: 20,
      supplierExtensionDays: 10,
    });
  });
  it("returns nothing for a question it can't map, including a sales RISE", () => {
    expect(read("What's the weather like?")).toEqual({});
    expect(read("What if sales rise 10%?")).toEqual({});
    expect(read("")).toEqual({});
  });
  it("does not clamp: an out-of-range answer is left for the same check as a real AI's", () => {
    expect(read("What if sales drop 80%?")).toEqual({ salesDropPercent: 80 });
    expect(parseWhatIf(read("What if sales drop 80%?")).ok).toBe(false);
  });
});
