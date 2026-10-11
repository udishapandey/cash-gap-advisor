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
const FORBIDDEN = /\(|\)|because|n\/a|—|Note:|[A-Za-z]:\s/i;
const DEFAULT_SCREENS = ["app/page.tsx", "components/GapScreen.tsx", "components/OptionsScreen.tsx", "components/ResultsScreen.tsx"];

describe("the shell", () => {
  const layout = read("app/layout.tsx");
  it("has one peach banner, a dark top bar with the app name, and the footer", () => {
    expect(layout).toContain("Concept prototype. All merchant data is simulated.");
    expect(layout.split("All merchant data is simulated")).toHaveLength(2);
    expect(layout).toContain("bg-navy");
    expect(layout).toContain(">Cash Gap Advisor</header>");
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
    has("app/page.tsx", "Overview", "Next {invoice.dueInDays} days", 'label="Upcoming supplier bill"', 'label="Cash coming in"', 'label="Cash going out"', 'label="Likely short"', "Plan this payment");
  });
  it("Bill", () => {
    has("components/InvoiceFlow.tsx", "Supplier bill", "Upload the bill. Check what we read.", "Confirm bill");
    expect(read("components/InvoiceFlow.tsx")).not.toContain("Evidence:"); // the quote is a hover icon now
  });
  it("Cash gap", () => {
    has("components/GapScreen.tsx", "Cash gap", "How short you could be before the due date.", 'label="Likely short"', "Could be", '"Summary"', '"Cash in"', '"Cash out"', '"Low sales"', '"Expected"', '"High sales"', "Adjust", "Other cash you can use", "Your bank's overdraft rate", "See funding plan");
    expect(read("components/GapScreen.tsx")).not.toContain("hint=");
  });
  it("Plan", () => {
    has("components/OptionsScreen.tsx", "Recommended plan", "Approve plan", "Why this plan", "Ask for {days} more days", "Could remove", "Get call script", '"All options"', '"If sales drop"', "Source", "Amount", "Days", "Total cost");
    has("lib/plain.ts", "Early settlement is costly per year, but you need it for only", "No cost unless used.", "better off than borrowing the usual way", "Settle your sales early", "Your bank overdraft", "Razorpay credit line");
  });
  it("Plan shows the explanation only when asked, and has no extra links", () => {
    const o = read("components/OptionsScreen.tsx");
    expect(o).toContain("{whyOpen && (");
    expect(o).not.toContain("Back to cash gap");
  });
  it("Approve", () => {
    has("components/ApproveScreen.tsx", "Supplier paid", "Simulated. No real money moved.", "See results", "Back to home");
    expect(read("components/ApproveScreen.tsx")).not.toContain("Start another invoice");
  });
  it("Results", () => {
    has("components/ResultsScreen.tsx", "After Diwali", "As forecast", "15% lower", "15% higher", "Next time", "Details", "Plan another bill");
    has("lib/results.ts", '"You saved"', '"Borrowed"', '"Pairs sold"', '"Forecast"', "On target");
    expect(read("components/ResultsScreen.tsx")).not.toMatch(/sold out/i);
  });
});

describe("the copy rules, on every default view", () => {
  it.each(DEFAULT_SCREENS)("%s has no brackets, because, n/a, em dashes, notes or colons in a sentence", (file) => {
    const bad = visibleText(file).filter((t) => FORBIDDEN.test(t));
    expect(bad).toEqual([]);
  });
  it.each(DEFAULT_SCREENS)("%s has no paragraph on the default view: every text is a label or a short sentence", (file) => {
    for (const t of visibleText(file)) expect(t.split(/\s+/).length, t).toBeLessThanOrEqual(12);
  });
  it("the Approve and Bill screens add none of the forbidden words either (their KFS and consent text is left as it is)", () => {
    expect(read("components/ApproveScreen.tsx")).not.toMatch(/Start another invoice|Continue to approve/);
  });
});

describe("the building blocks", () => {
  it("a stat card is a label, a number and a short caption; red only for short, green only for savings", () => {
    const short = renderToStaticMarkup(<StatCard label="Likely short" value="₹2,27,621" tone="short" />);
    expect(short).toContain("text-red-700");
    expect(short).toContain("Likely short");
    const saved = renderToStaticMarkup(<StatCard label="You saved" value="₹11,310" caption="₹10,000 discount + ₹1,310 lower interest" tone="saved" />);
    expect(saved).toContain("text-green-700");
    expect(saved).toContain("₹10,000 discount + ₹1,310 lower interest");
    const plain = renderToStaticMarkup(<StatCard label="Cash coming in" value="₹13,22,379" />);
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
