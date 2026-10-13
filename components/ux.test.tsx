// The Razorpay-dashboard style: a label, a number, a short caption, and the detail in tabs and tables.
// These tests pin the copy that was written by hand, and scan the screens' visible text against the copy rules.

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_JOURNEY, STEPS } from "@/lib/journey";
import Disclosure from "./Disclosure";
import Tabs from "./Tabs";
import { SimulatedTag, StatCard } from "./ui";

const read = (p: string) => readFileSync(p, "utf8");

/** The words a founder can see in a file: JSX text, plus label, caption and title attributes. Code and comments are left out. */
function visibleText(file: string): string[] {
  const src = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const out: string[] = [];
  for (const m of src.matchAll(/>([^<>{}=]+)</g)) if (/[A-Za-z]{2}/.test(m[1]) && !/[;]/.test(m[1])) out.push(m[1].replace(/\s+/g, " ").trim());
  for (const m of src.matchAll(/\b(?:label|caption|title|placeholder)="([^"]+)"/g)) out.push(m[1]);
  return out;
}
const FORBIDDEN = /\(|\)|because|n\/a|—|Note:/i;
const DEFAULT_SCREENS = ["app/page.tsx", "components/GapScreen.tsx", "components/OptionsScreen.tsx", "components/ResultsScreen.tsx"];

describe("the shell", () => {
  const layout = read("app/layout.tsx");
  it("has one peach banner, a dark top bar with the app name, and the footer", () => {
    expect(layout).toContain("Concept prototype. All merchant data is simulated.");
    expect(layout.split("All merchant data is simulated")).toHaveLength(2);
    expect(layout).toContain("bg-navy");
    expect(layout).toContain(">Cash Gap Advisor</span>");
    expect(layout).toContain("Concept prototype for the Razorpay x ISB challenge");
    expect(layout).not.toMatch(/<img|next\/image|<Image/); // no Razorpay logo or wordmark
  });
  it("the sidebar has Home and Supplier bills, and nothing else", () => {
    const nav = read("components/NavLinks.tsx");
    expect(nav).toContain('label: "Home"');
    expect(nav).toContain('label: "Supplier bills"');
    expect(nav.match(/label: "/g)).toHaveLength(2);
    expect(layout).toContain("<NavLinks />");
  });
  it("the tracker reads Bill, Cash gap, Plan, Approve, Results", () => {
    expect(STEPS.map((s) => s.label)).toEqual(["Bill", "Cash gap", "Plan", "Approve", "Results"]);
    expect(read("components/JourneyShell.tsx")).toContain("<Stepper");
    expect(read("components/InvoiceFlow.tsx")).toContain('<Stepper current="invoice"');
  });
  it("the old per-item badge renders nothing, and English is the default", () => {
    expect(renderToStaticMarkup(<SimulatedTag />)).toBe("");
    expect(DEFAULT_JOURNEY.language).toBe("en");
  });
});

describe("the copy, as written", () => {
  const has = (file: string, ...texts: string[]) => {
    const src = read(file);
    for (const t of texts) expect(src, `${file}: ${t}`).toContain(t);
  };
  it("Home", () => {
    has("app/page.tsx", "Supplier bills", "Opportunity", "Net benefit", "Review plan");
    has("lib/plain.ts", "Save ${formatINR(", "Cash needed", "Financing cost", "Bill due", "Overdraft", "Razorpay credit");
  });
  it("Bill", () => {
    has("components/InvoiceFlow.tsx", "Upload supplier bill", "We found an early-payment opportunity", "View bill details", "Confirm bill", "Extracted automatically", "Needs review", "Missing", "Read again with AI", "Read by AI earlier");
    expect(read("components/InvoiceFlow.tsx")).not.toContain("Evidence:");
    expect(read("components/InvoiceFlow.tsx")).not.toMatch(/Check what the AI read|The AI reads it/);
    has("lib/plain.ts", "We don't store your bill. It is shared with our AI provider only to read it.", "can charge late interest of 3x the RBI bank rate, compounded monthly.", "Save ${formatINR(off)}");
  });
  it("Bill shows only supplier, total, due date and the discount by default; the rest is under 'View bill details'", () => {
    const f = read("components/InvoiceFlow.tsx");
    expect(f).toContain('const MAIN: FieldKey[] = ["supplierName", "totalAmount", "dueDate", "earlyPaymentDiscountPercent", "earlyPaymentDiscountDays"]');
    expect(f).toContain('const MORE: FieldKey[] = ["invoiceNumber", "invoiceDate", "quantity", "unitPrice", "lateFeePercentPerMonth"]');
    // The sample bill loads the saved reading, with no AI call.
    expect(f).toContain("onClick={usePreReadSample}");
  });
  it("Bill falls back at once when the AI is busy: saved reading for the sample, manual entry for an upload, within 35 seconds", () => {
    const f = read("components/InvoiceFlow.tsx");
    expect(f).toContain("const CLIENT_TIMEOUT_MS = 35_000");
    expect(f).toContain('"AI is busy right now. Showing the reading saved earlier."');
    expect(f).toContain('"AI is busy right now. Please check and fill the fields."');
    expect(f).toContain("aiBusy(isSample, hadReading, fileHash)");
    expect(f).toContain("Download sample bills to try:");
    expect(f).toContain('target="_blank"');
    expect(f).toContain('showExtraction(emptyExtraction(), "manual")');
  });
  it("Cash gap", () => {
    has("components/GapScreen.tsx", "Expected shortfall", "How we estimated this", "Other available cash", "See cheapest plan", "ESTIMATE_LINE", '"Low sales"', '"Expected"', '"High sales"');
    has("lib/plain.ts", "To pay early, you'd be", "short for", "This estimate combines expected sales, settlements, COD cash and upcoming outflows.", "Includes ${formatINR(", "safety buffer", "needs no borrowing.", '"Forecast"', "Low confidence", "Cash available", "Cash going out", "Discount deadline", "Festive uplift", "COD share", "COD timing", "Returns", "Settlement timing", "Connected banking", "Store and courier data", "Entered by you");
  });
  it("Plan", () => {
    has("components/OptionsScreen.tsx", "Recommended plan", "Net benefit", "Supplier discount", "Financing cost", "Review &amp; approve", "Why this plan?", "What if sales are lower?", "Ask for more days", "Get call script", '"Compare options"', '"What if sales change"', "Source", "Amount", "Repaid by");
    has("lib/plain.ts", "No cost unless used.", "Net benefit ${formatINR(saving)}", "Your cash", "Your bank overdraft", "Razorpay credit line", "Loans are repaid as sales money arrives.", "Rates are illustrative. Final terms are in your Key Fact Statement.", "Not needed. Overdraft costs less.");
    expect(read("lib/plain.ts")).not.toMatch(/54\.75|annualis/i);
  });
  it("Plan shows the explanation only when asked, and has no extra links", () => {
    const o = read("components/OptionsScreen.tsx");
    expect(o).toContain("{whyOpen && (");
    expect(o).not.toContain("Back to cash gap");
  });
  it("Plan hides 'Ask for more days' and the call script when the due date needs no borrowing", () => {
    const o = read("components/OptionsScreen.tsx");
    expect(o).toContain("recView.gap.gapExpected > 0 && (");
    expect(o.indexOf("recView.gap.gapExpected > 0")).toBeLessThan(o.indexOf("<AskCard"));
  });
  it("Approve: the Key Fact Statement and an unticked consent come before the approval", () => {
    const a = read("components/ApproveScreen.tsx");
    expect(a).toContain("useState(false)");
    expect(a.indexOf("Key Fact Statement")).toBeLessThan(a.indexOf("onClick={approve}"));
    expect(a.indexOf('type="checkbox"')).toBeLessThan(a.indexOf("onClick={approve}"));
    expect(a).toContain("Pay by ${date(payDay)} for the discount · bill due ${date(view.invoice.dueInDays)}");
  });
  it("Approve", () => {
    has("components/ApproveScreen.tsx", "You're about to pay", "Payment sources", "Repayment", "Estimated financing cost", "Financing approval", "Key Fact Statement", "View full statement", "payment`", "Pay supplier", "Supplier paid", "Simulated. No real money moved.", "See results");
    has("lib/plain.ts", "Razorpay credit is subject to eligibility and final lender terms. Values are illustrative.");
    expect(read("components/ApproveScreen.tsx")).not.toContain("Start another invoice");
  });
  it("Results", () => {
    has("components/ResultsScreen.tsx", "Payment complete", "Supplier paid", "Expected net benefit", "Early-payment discount", "Estimated financing cost", "What happens next", "How did the forecast perform?", "Actual (simulated)", "On forecast", "Done");
    has("lib/results.ts", "Saved", "Day ${m.day}: sales", "Nothing changes.");
    expect(read("components/ResultsScreen.tsx")).not.toMatch(/sold out|Approve updated plan|15% lower|15% higher|Mid-season|simple update rule|1\.4x/i);
  });
});

describe("words that must not appear on a default view", () => {
  const BANNED = /peak shortfall|annualis|right-?siz|standby|1\.4x|simple update rule|54\.75/i;
  it.each([...DEFAULT_SCREENS, "components/ApproveScreen.tsx", "components/InvoiceFlow.tsx"])("%s", (file) => {
    expect(visibleText(file).filter((t) => BANNED.test(t))).toEqual([]);
  });
  it("lib/plain.ts and lib/results.ts keep them out of their strings (the estimates table sits in a collapsed section)", () => {
    const strings = (src: string) =>
      [...src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").matchAll(/(["`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map((m) => m[2]);
    const found = [...strings(read("lib/plain.ts")), ...strings(read("lib/results.ts"))].filter((t) => BANNED.test(t) && !t.includes("normal sales") && !t.startsWith("./"));
    expect(found).toEqual([]);
  });
});

describe("the copy rules, on every default view", () => {
  it.each(DEFAULT_SCREENS)("%s has no brackets, because, n/a, em dashes, notes or colons in a sentence", (file) => {
    // Two lines in the collapsed "How did the forecast perform?" section are product-owner copy and keep their brackets and length.
    const bad = visibleText(file).filter((t) => FORBIDDEN.test(t) && t !== "Actual (simulated)");
    expect(bad).toEqual([]);
  });
  it.each(DEFAULT_SCREENS)("%s has no paragraph on the default view: every text is a label or a short sentence", (file) => {
    for (const t of visibleText(file)) {
      if (t.startsWith("Sales and COD returns were close to forecast")) continue;
      expect(t.split(/\s+/).length, t).toBeLessThanOrEqual(12);
    }
  });
  it("the Approve and Bill screens add none of the forbidden words either (their KFS and consent text is left as it is)", () => {
    expect(read("components/ApproveScreen.tsx")).not.toMatch(/Start another invoice|Continue to approve/);
  });
});

describe("the building blocks", () => {
  it("a stat card is a label, a number and a short caption; red only for short, green only for savings", () => {
    const short = renderToStaticMarkup(<StatCard label="Likely short" value="₹2,30,900" tone="short" />);
    expect(short).toContain("text-red-700");
    expect(short).toContain("Likely short");
    const saved = renderToStaticMarkup(<StatCard label="You saved" value="₹9,583" caption="₹10,000 discount less ₹417 interest" tone="saved" />);
    expect(saved).toContain("text-green-700");
    expect(saved).toContain("₹10,000 discount less ₹417 interest");
    const plain = renderToStaticMarkup(<StatCard label="Cash coming in" value="₹12,09,100" />);
    expect(plain).not.toMatch(/text-red-700|text-green-700/);
  });
  it("tabs show the first tab and keep the others hidden", () => {
    const html = renderToStaticMarkup(
      <Tabs label="t" tabs={[{ id: "a", label: "Summary", content: "ONE" }, { id: "b", label: "Cash in", content: "TWO" }]} />,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/aria-selected="true"[^>]*>Summary/);
    expect(html).toMatch(/hidden=""[^>]*>TWO|<div[^>]*hidden=""[^>]*>TWO/);
  });
  it("a disclosure is closed by default, and lazy keeps its content out until opened", () => {
    expect(renderToStaticMarkup(<Disclosure title="Details">x</Disclosure>)).not.toMatch(/<details[^>]*\bopen\b/);
    expect(renderToStaticMarkup(<Disclosure title="Why this plan" lazy>SECRET</Disclosure>)).not.toContain("SECRET");
    expect(renderToStaticMarkup(<Disclosure title="Why this plan" lazy open>SECRET</Disclosure>)).toContain("SECRET");
  });
});
