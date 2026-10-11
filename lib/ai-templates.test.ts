import { describe, expect, it } from "vitest";
import { merchant } from "./data/merchant";
import { sampleInvoice } from "./data/invoice";
import { planFacts, scriptFacts } from "./ai-facts";
import { formatINR as inr } from "./format";
import { templateExplanation, templateExplanationParts, templateScript } from "./ai-templates";
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

  it("has three non-empty parts: what to do, why it is cheapest, what to watch out for", () => {
    for (const language of BOTH) {
      for (const drop of ALL_DROPS) {
        const p = templateExplanationParts(planFacts(run(drop)), language);
        expect(Object.keys(p)).toEqual(["doThis", "whyCheapest", "watchOut"]);
        for (const part of Object.values(p)) expect(part.length, `${language} -${drop}%`).toBeGreaterThan(20);
        expect(templateExplanation(planFacts(run(drop)), language)).toBe(`${p.doThis} ${p.whyCheapest} ${p.watchOut}`);
      }
    }
  });

  it("has the same structure and the same numbers in English and Hindi", () => {
    for (const drop of [0, 10, 20, 25, 30]) {
      const facts = planFacts(run(drop));
      const en = templateExplanationParts(facts, "en");
      const hi = templateExplanationParts(facts, "hi");
      for (const k of ["doThis", "whyCheapest", "watchOut"] as const) {
        const nums = (t: string) => (t.match(/[\d,.]*\d/g) ?? []).sort().join(" ");
        expect(nums(hi[k]), `${k} at -${drop}%`).toBe(nums(en[k]));
      }
    }
  });

  it("do this: names the order, the pay-by day and every funding source with its exact amount", () => {
    const facts = planFacts(run(0));
    const v = facts.keepFull;
    const { doThis } = templateExplanationParts(facts, "en");
    expect(doThis).toContain(`Order all ${facts.pairsOrdered} pairs`);
    expect(doThis).toContain(`by day ${v.payByDay}`);
    expect(doThis).toContain(`${v.earlyPaymentDiscountPercent}% discount`);
    expect(v.steps.length).toBeGreaterThan(1);
    for (const s of v.steps) expect(doThis).toContain(`${s.source} ${inr(s.amountRupees)}`);
    const hi = templateExplanationParts(facts, "hi").doThis;
    expect(hi).toContain(`पूरे ${facts.pairsOrdered} जोड़ी का ऑर्डर मंगवाएँ`);
    expect(hi).toContain(`दिन ${v.payByDay} तक`);
    expect(hi).toContain(`अर्ली सेटलमेंट ${inr(v.steps[0].amountRupees)}`);
  });

  it("why cheapest: funding cost against the discount, and the net result", () => {
    const facts = planFacts(run(0));
    const v = facts.keepFull;
    expect(v.paysEarlyForDiscount).toBe(true);
    const { whyCheapest } = templateExplanationParts(facts, "en");
    expect(whyCheapest).toContain(inr(v.fundingCostRupees));
    expect(whyCheapest).toContain(inr(v.earlyPaymentDiscountRupees));
    expect(whyCheapest).toContain(inr(v.netSavingFromEarlyPaymentRupees));
    // The sentence adds up: the discount minus the EXTRA cost of paying early is the net saving it states.
    expect(whyCheapest).toContain(inr(v.extraCostOfPayingEarlyRupees));
    expect(v.earlyPaymentDiscountRupees - v.extraCostOfPayingEarlyRupees).toBe(v.netSavingFromEarlyPaymentRupees);
    expect(whyCheapest.split(/(?<=\.)\s/).length).toBe(1);
  });

  it("watch out: never says 0% without 'at expected sales', and gives the lower-sales figure", () => {
    for (const drop of ALL_DROPS) {
      const facts = planFacts(run(drop));
      for (const language of BOTH) {
        const { watchOut } = templateExplanationParts(facts, language);
        if (/(?<![\d.])0\s*%/.test(watchOut)) expect(watchOut, `${language} -${drop}%`).toMatch(/expected sales|अनुमानित बिक्री/);
      }
    }
    const facts = planFacts(run(0));
    const v = facts.keepFull;
    expect(v.unsoldPairsAtExpectedSales).toBe(0);
    expect(v.unsoldPairsAtLowSales).toBeGreaterThan(0);
    const en = templateExplanationParts(facts, "en").watchOut;
    expect(en).toContain(`At expected sales all ${v.pairs} pairs should sell; at lower sales about ${v.unsoldPairsAtLowSales} pairs (${v.unsoldAtLowSalesPercent}%) could be left over`);
    expect(en).not.toMatch(/\b0 pairs|\(0%\)/);
    const hi = templateExplanationParts(facts, "hi").watchOut;
    expect(hi).toContain(`अनुमानित बिक्री पर सभी ${v.pairs} जोड़ी बिक जानी चाहिए`);
    expect(hi).toContain(`कम बिक्री पर लगभग ${v.unsoldPairsAtLowSales} जोड़ी`);
    expect(hi).not.toMatch(/(?<![\d.])0 जोड़ी|\(0%\)/);
  });

  it("never says '0 pairs' or '(0%)' at any slider value, in either language", () => {
    for (const drop of ALL_DROPS) for (const language of BOTH) {
      expect(templateExplanationParts(planFacts(run(drop)), language).watchOut, `${language} -${drop}%`).not.toMatch(/(?<![\d.,])0 (?:pairs|जोड़ी)|\(0%\)/);
    }
  });

  it("Hindi uses 'नकदी की कमी' and 'जल्दी भुगतान', never 'नकद की कमी' or 'शुरुआती भुगतान'", () => {
    for (const drop of ALL_DROPS) {
      const hi = templateExplanation(planFacts(run(drop)), "hi");
      expect(hi, `-${drop}%`).not.toMatch(/नकद की कमी|शुरुआती भुगतान/);
    }
    const hi = templateExplanationParts(planFacts(run(0)), "hi");
    expect(hi.doThis).toContain("नकदी की कमी");
    expect(hi.whyCheapest).toContain("जल्दी भुगतान");
  });

  it("when the order is cut, watch-out figures are for the smaller order, not the invoice", () => {
    const facts = planFacts(run(25));
    const v = facts.rightSized;
    expect(facts.recommendedPlan).toBe("right_sized");
    const en = templateExplanationParts(facts, "en").watchOut;
    expect(en).toContain(`all ${v.pairs} pairs should sell`);
    expect(en).toContain(`about ${v.unsoldPairsAtLowSales} pairs (${v.unsoldAtLowSalesPercent}%)`);
    expect(en).not.toContain(`${facts.pairsOrdered - v.pairs} pairs`);
  });

  it("explains early settlement by days, not yearly rates, when there is no discount to take", () => {
    const facts = planFacts(runEngine({ merchant, invoice: { ...sampleInvoice, earlyPayDiscountPct: 0 } }));
    const why = templateExplanationParts(facts, "en").whyCheapest;
    expect(facts.recommendedPlan === "right_sized" ? facts.rightSized.paysEarlyForDiscount : facts.keepFull.paysEarlyForDiscount).toBe(false);
    expect(why).toContain(`needed for only ${facts.earlySettlementDays} days`);
    expect(why).toContain(`a loan would run ${facts.loanDays} days`);
    expect(why).not.toContain("a year");
  });

  it("names the left-over stock risk for the recommended order", () => {
    const facts = planFacts(run(30));
    const v = facts.rightSized;
    const text = templateExplanation(facts, "en");
    expect(facts.recommendedPlan).toBe("right_sized");
    expect(text).toContain(`${v.unsoldPairsAtLowSales} pairs`);
    expect(text).toContain(`${v.unsoldAtLowSalesPercent}%`);
    expect(text).toContain("left over");
  });

  it("describes ordering fewer pairs when the right-sized plan is recommended", () => {
    const facts = planFacts(run(30));
    expect(templateExplanation(facts, "en")).toContain(`Order ${facts.rightSized.pairs} of ${facts.pairsOrdered} pairs now`);
  });

  it("describes the keep-full plan when that is recommended", () => {
    const facts = planFacts(run(0));
    expect(facts.recommendedPlan).toBe("keep_full");
    const text = templateExplanation(facts, "en");
    expect(text).not.toContain("of 500 pairs now");
    expect(text).toContain("early settlement");
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
