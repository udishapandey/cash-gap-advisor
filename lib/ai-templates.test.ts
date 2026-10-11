import { describe, expect, it } from "vitest";
import { merchant } from "./data/merchant";
import { sampleInvoice } from "./data/invoice";
import { planFacts, scriptFacts } from "./ai-facts";
import { templateExplanation, templateScript } from "./ai-templates";
import { runEngine } from "./engine";
import { checkGrounding } from "./grounding";
import type { Language } from "./language";

const run = (drop = 0, extra = {}) => runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: drop, ...extra });
const ALL_DROPS = Array.from({ length: 31 }, (_, i) => i); // every whole % from 0 to -30
const BOTH: Language[] = ["en", "hi"];
const DEVANAGARI = /[ऀ-ॿ]/;
const DEVANAGARI_DIGITS = /[०-९]/;

describe("the explanation template (also the mock AI answer and the fallback)", () => {
  it.each(BOTH)("every number is grounded in its own facts, at every slider value (%s)", (language) => {
    for (const drop of ALL_DROPS) {
      const facts = planFacts(run(drop));
      const text = templateExplanation(facts, language);
      const g = checkGrounding(text, facts);
      expect(g.ungrounded.map((m) => m.text), `${language} at -${drop}%`).toEqual([]);
      expect(text.length).toBeGreaterThan(80);
    }
  });

  it("is three to four sentences, plus a warning only when one applies", () => {
    for (const drop of [0, 10, 20, 30]) {
      const text = templateExplanation(planFacts(run(drop)), "en");
      const sentences = text.split(/(?<=[.])\s+/).filter(Boolean);
      expect(sentences.length).toBeGreaterThanOrEqual(3);
      expect(sentences.length).toBeLessThanOrEqual(5);
    }
  });

  it("says what to do, why it is cheapest and the main risk", () => {
    const text = templateExplanation(planFacts(run(30)), "en");
    expect(text).toContain("Here is what to do");
    expect(text).toContain("cheapest");
    expect(text).toContain("main risk");
  });

  it("names the unsold-stock risk from the right-sizing comparison", () => {
    const facts = planFacts(run(30));
    const text = templateExplanation(facts, "en");
    expect(facts.recommendedPlan).toBe("right_sized");
    expect(text).toContain(`${facts.stock.unsoldPairsIfFullOrder} pairs`);
    expect(text).toContain(`${facts.stock.unsoldIfFullOrderPercent}%`);
    expect(text).toContain("unsold");
  });

  it("describes ordering fewer pairs when the right-sized plan is recommended", () => {
    const facts = planFacts(run(30));
    expect(templateExplanation(facts, "en")).toContain(`order ${facts.rightSized.pairs} of ${facts.pairsOrdered} pairs now`);
  });

  it("describes the keep-full plan when that is recommended", () => {
    const facts = planFacts(run(0));
    expect(facts.recommendedPlan).toBe("keep_full");
    const text = templateExplanation(facts, "en");
    expect(text).not.toContain("of 500 pairs now");
    expect(text).toContain("settle");
  });

  it("says no borrowing is needed when cash covers the invoice", () => {
    const facts = planFacts(runEngine({ merchant, invoice: sampleInvoice, cashElsewhere: 5_000_000 }));
    const text = templateExplanation(facts, "en");
    expect(facts.keepFull.steps).toEqual([]);
    expect(text).toContain("You do not need to borrow");
    expect(text).not.toContain("credit line");
    expect(checkGrounding(text, facts).ok).toBe(true);
    expect(templateExplanation(facts, "hi")).toContain("कर्ज़ लेने की ज़रूरत नहीं");
  });

  it("warns when part of the shortfall is not covered", () => {
    // 500 pairs at ₹10,000 each: all expected to sell, so keep-full is recommended, and it can't be covered.
    const facts = planFacts(runEngine({ merchant, invoice: { ...sampleInvoice, amount: 5_000_000, unitPrice: 10_000 } }));
    expect(facts.recommendedPlan).toBe("keep_full");
    expect(facts.keepFull.fullyCovered).toBe(false);
    const text = templateExplanation(facts, "en");
    expect(text).toContain("Warning");
    expect(text).toContain(`₹${facts.keepFull.uncoveredRupees.toLocaleString("en-IN")}`);
    expect(checkGrounding(text, facts).ok).toBe(true);
  });

  it("flags an uncertain forecast", () => {
    const facts = planFacts(run(0));
    expect(facts.lowConfidenceForecast).toBe(true);
    expect(templateExplanation(facts, "en")).toContain("uncertain");
  });

  it("Hindi is in Devanagari, but numbers stay as 0-9 digits so they can be checked", () => {
    const text = templateExplanation(planFacts(run(30)), "hi");
    expect(text).toMatch(DEVANAGARI);
    expect(text).not.toMatch(DEVANAGARI_DIGITS);
    expect(text).toContain("₹");
  });

  it("English has no Devanagari", () => {
    expect(templateExplanation(planFacts(run(30)), "en")).not.toMatch(DEVANAGARI);
  });
});

describe("the call script template", () => {
  const plan = run(0).views.keepFull.duePlan;
  const base = { extensionDays: 15, borrowingRemovedRupees: 56_634 };
  const facts = () => scriptFacts(sampleInvoice, plan, base);

  it.each(BOTH)("every number is grounded in its own facts (%s)", (language) => {
    const f = facts();
    expect(checkGrounding(templateScript(f, language), f).ungrounded).toEqual([]);
  });

  it("is a list of talking points, one per line starting with '- '", () => {
    const lines = templateScript(facts(), "en").split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines.every((l) => l.startsWith("- "))).toBe(true);
  });

  it("is polite, names the invoice, and asks for extra days first", () => {
    const text = templateScript(facts(), "en");
    expect(text).toContain("value working with");
    expect(text).toContain("Sample Footwear Manufacturer");
    expect(text).toContain("₹5,00,000");
    expect(text).toContain("due in 10 days");
    expect(text).toContain("Ask first for 15 extra days");
  });

  it("offers part-payment now and the rest later, with both amounts", () => {
    const f = facts();
    const text = templateScript(f, "en");
    expect(text).toContain("pay ₹2,72,379 on time and the remaining ₹2,27,621");
    expect(f.payOnTimeRupees).toBe(272_379);
    expect(f.payLaterRupees).toBe(227_621);
  });

  it("makes no threats and does not mention the late fee or any pressure", () => {
    const text = templateScript(facts(), "en").toLowerCase();
    for (const word of ["late fee", "penalty", "legal", "cancel", "never order", "or else"]) expect(text).not.toContain(word);
  });

  it("is for the founder to say aloud: it ends by confirming in writing", () => {
    expect(templateScript(facts(), "en")).toContain("confirm it in writing");
  });

  it("when nothing is left to pay later, only confirms the date", () => {
    const none = runEngine({ merchant, invoice: sampleInvoice, cashElsewhere: 5_000_000 }).views.keepFull.duePlan;
    const text = templateScript(scriptFacts(sampleInvoice, none, base), "en");
    expect(text).toContain("pay in full on time");
    expect(text).not.toContain("extra days");
  });

  it("asks for 'a little more time' when no particular number of days is chosen", () => {
    const text = templateScript(scriptFacts(sampleInvoice, plan, { ...base, extensionDays: 0 }), "en");
    expect(text).toContain("a little more time");
    expect(text).not.toContain("0 extra days");
  });

  it("Hindi is in Devanagari with ordinary digits", () => {
    const text = templateScript(facts(), "hi");
    expect(text).toMatch(DEVANAGARI);
    expect(text).not.toMatch(DEVANAGARI_DIGITS);
    expect(text).toContain("15 दिन");
  });
});
