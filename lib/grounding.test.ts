import { describe, expect, it } from "vitest";
import { merchant } from "./data/merchant";
import { sampleInvoice } from "./data/invoice";
import { planFacts } from "./ai-facts";
import { runEngine } from "./engine";
import { checkGrounding, collectFactNumbers, extractMentions } from "./grounding";

const facts = {
  loanRupees: 227_621,
  costRupees: 2_058,
  nested: { steps: [{ amountRupees: 1_70_987 }, { amountRupees: 100_000 }] },
  ratePercent: 18,
  annualisedPercent: 54.75,
  unsoldPercent: 27.2,
  pairs: 364, // a count: never checked as money
  payByDay: 7,
};
const values = (text: string) => extractMentions(text).map((m) => [m.kind, m.value]);

describe("finding the ₹ amounts and % in a text", () => {
  it("reads ₹ amounts with Indian commas", () => {
    expect(values("Borrow ₹71,658 on the credit line.")).toEqual([["rupees", 71_658]]);
    expect(values("Pay ₹5,00,000 and ₹50.")).toEqual([["rupees", 500_000], ["rupees", 50]]);
  });
  it("reads Rs, INR and 'rupees'", () => {
    expect(values("Rs. 5,00,000")).toEqual([["rupees", 500_000]]);
    expect(values("INR 5000")).toEqual([["rupees", 5_000]]);
    expect(values("5000 rupees")).toEqual([["rupees", 5_000]]);
  });
  it("reads lakh and crore, with or without the ₹", () => {
    expect(values("about ₹2.3 lakh")).toEqual([["rupees", 230_000]]);
    expect(values("2.3 lakh")).toEqual([["rupees", 230_000]]);
    expect(values("₹1.2 crore")).toEqual([["rupees", 12_000_000]]);
    expect(values("₹2 lakhs")).toEqual([["rupees", 200_000]]);
  });
  it("reads Hindi words and Devanagari digits", () => {
    expect(values("₹2.3 लाख")).toEqual([["rupees", 230_000]]);
    expect(values("₹१,००,०००")).toEqual([["rupees", 100_000]]);
    expect(values("२७%")).toEqual([["percent", 27]]);
    expect(values("27 प्रतिशत")).toEqual([["percent", 27]]);
  });
  it("reads percentages in several forms", () => {
    expect(values("18% a year")).toEqual([["percent", 18]]);
    expect(values("54.75 percent")).toEqual([["percent", 54.75]]);
    expect(values("0.3 per cent")).toEqual([["percent", 0.3]]);
  });
  it("counts an amount once, not once per pattern", () => {
    expect(extractMentions("₹2.3 lakh")).toHaveLength(1);
    expect(extractMentions("₹2.3 lakh and ₹5,000 rupees")).toHaveLength(2);
  });
  it("ignores numbers that are not money or percentages", () => {
    expect(extractMentions("364 pairs, pay by day 7, borrowed for 33 days, 3 crew members")).toEqual([]);
  });
  it("copes with trailing punctuation", () => {
    expect(values("It costs ₹1,17,164, then more.")).toEqual([["rupees", 117_164]]);
    expect(values("It costs ₹1,17,164.")).toEqual([["rupees", 117_164]]);
  });
});

describe("which numbers a ₹ amount or a % may match", () => {
  it("collects rupee numbers and percent numbers separately, from the key names", () => {
    const pool = collectFactNumbers(facts);
    expect(pool.rupees.sort((a, b) => a - b)).toEqual([2_058, 100_000, 170_987, 227_621]);
    expect(pool.percents.sort((a, b) => a - b)).toEqual([18, 27.2, 54.75]);
  });
  it("leaves counts and days out of both pools", () => {
    const pool = collectFactNumbers(facts);
    expect(pool.rupees).not.toContain(364);
    expect(pool.percents).not.toContain(7);
  });
});

describe("the grounding check", () => {
  it("passes a text whose ₹ amounts and % all come from the facts", () => {
    const r = checkGrounding("Loans of ₹2,27,621 cost ₹2,058, about 18% a year. 364 pairs by day 7.", facts);
    expect(r.ok).toBe(true);
    expect(r.ungrounded).toEqual([]);
  });
  it("passes a text with no numbers at all", () => {
    expect(checkGrounding("Order fewer pairs and settle early.", facts).ok).toBe(true);
  });

  it("REJECTS an invented ₹ amount", () => {
    const r = checkGrounding("You will save ₹5,55,555 this season.", facts);
    expect(r.ok).toBe(false);
    expect(r.ungrounded.map((m) => m.text)).toEqual(["₹5,55,555"]);
  });
  it("REJECTS an invented percentage", () => {
    const r = checkGrounding("About 73% of the stock may stay unsold.", facts);
    expect(r.ok).toBe(false);
    expect(r.ungrounded[0].kind).toBe("percent");
  });
  it("rejects the whole text if only one of several numbers is invented", () => {
    const r = checkGrounding("It costs ₹2,058 at 18%, saving ₹9,999.", facts);
    expect(r.ok).toBe(false);
    expect(r.ungrounded.map((m) => m.text)).toEqual(["₹9,999"]);
  });
  it("REJECTS a number the AI worked out itself, such as a sum of two amounts", () => {
    // 1,70,987 + 1,00,000 = 2,70,987, which is not in the facts
    expect(checkGrounding("Together that is ₹2,70,987.", facts).ok).toBe(false);
  });

  it("allows rounding: lakh to the digits shown", () => {
    expect(checkGrounding("about ₹2.3 lakh", facts).ok).toBe(true); // 2,27,621
    expect(checkGrounding("about ₹2.28 lakh", facts).ok).toBe(true);
    expect(checkGrounding("about ₹2.5 lakh", facts).ok).toBe(false);
    expect(checkGrounding("₹2 lakh", facts).ok).toBe(true); // 2,27,621 rounds to 2 lakh
    expect(checkGrounding("₹3 lakh", facts).ok).toBe(false); // nothing in the facts rounds to 3 lakh
  });
  it("allows a plain amount within 1%, but not much more", () => {
    expect(checkGrounding("₹2,27,700", facts).ok).toBe(true);
    expect(checkGrounding("₹2,40,000", facts).ok).toBe(false);
  });
  it("allows a percentage rounded to the digits shown", () => {
    expect(checkGrounding("55% a year", facts).ok).toBe(true); // 54.75
    expect(checkGrounding("54.8% a year", facts).ok).toBe(true);
    expect(checkGrounding("27% unsold", facts).ok).toBe(true); // 27.2
    expect(checkGrounding("56% a year", facts).ok).toBe(false);
    expect(checkGrounding("28% unsold", facts).ok).toBe(false);
  });

  it("does not let a % match a rupee number, or a ₹ amount match a percent number", () => {
    expect(checkGrounding("18% a year", { x: 1, amountRupees: 18 }).ok).toBe(false);
    expect(checkGrounding("₹18", { ratePercent: 18 }).ok).toBe(false);
    expect(checkGrounding("₹18", { amountRupees: 18 }).ok).toBe(true);
  });
  it("does not let a count of pairs pass as an amount", () => {
    expect(checkGrounding("₹364", facts).ok).toBe(false);
  });

  it("checks Hindi text the same way", () => {
    expect(checkGrounding("कुल खर्च ₹2,058 है, यानी 18% सालाना।", facts).ok).toBe(true);
    expect(checkGrounding("कुल खर्च ₹७,७७७ है।", facts).ok).toBe(false);
    expect(checkGrounding("लगभग 99 प्रतिशत जोड़े बिना बिके रहेंगे।", facts).ok).toBe(false);
  });
});

describe("against the real engine's numbers", () => {
  const result = runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: 30 });
  const real = planFacts(result);
  it("accepts the engine's own loan, cost and rates", () => {
    const text = `Loans total ₹${real.rightSized.loanRupees.toLocaleString("en-IN")}, costing ₹${real.rightSized.fundingCostRupees.toLocaleString("en-IN")}, at ${real.ratesPercent.creditLineAnnualPercent}% a year.`;
    expect(checkGrounding(text, real).ok).toBe(true);
  });
  it("rejects a loan figure that is close but not the engine's", () => {
    const wrong = real.rightSized.loanRupees * 1.2; // 20% out
    expect(checkGrounding(`Loans total ₹${Math.round(wrong).toLocaleString("en-IN")}.`, real).ok).toBe(false);
  });
});
