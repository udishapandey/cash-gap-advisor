import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { merchant } from "@/lib/data/merchant";
import { sampleInvoice } from "@/lib/data/invoice";
import { planFacts, scriptFacts } from "@/lib/ai-facts";
import { templateExplanation, templateExplanationParts, templateScript } from "@/lib/ai-templates";
import { runEngine } from "@/lib/engine";
import { ResultsSummaryView } from "./ResultsSummary";
import { AiExplanationView, UNAVAILABLE_NOTE, VERIFIED_LABEL, isExplainOutcome, isVerifiedTextOutcome } from "./AiExplanation";
import { CallScriptView, SCRIPT_UNAVAILABLE_NOTE, SCRIPT_VERIFIED_LABEL } from "./CallScriptPanel";
import LanguageToggle from "./LanguageToggle";
import WhatIfAsk, { isWhatIfOutcome } from "./WhatIfAsk";

const noop = () => {};
const result = runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: 30 });
const explanation = templateExplanation(planFacts(result), "en");
/** What renderToStaticMarkup does to text: it escapes &, < and quotes. */
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
const view = result.views.keepFull;
const script = templateScript(scriptFacts(view.invoice, view.duePlan, { extensionDays: 15, borrowingRemovedRupees: 0 }), "en");

describe("the AI explanation on the Options screen", () => {
  it("is labelled 'AI-generated. Figures checked against the plan.' when the numbers checked out", () => {
    expect(VERIFIED_LABEL).toBe("AI-generated. Figures checked against the plan.");
    const html = renderToStaticMarkup(<AiExplanationView status="verified" text={explanation} mock={false} language="en" onLanguage={noop} />);
    expect(html).toContain("AI-generated. Figures checked against the plan.");
    expect(html).toContain(explanation.slice(0, 40));
    expect(html).not.toContain(UNAVAILABLE_NOTE);
  });

  it("shows the plain template with a small 'Standard explanation. AI unavailable.' note when it didn't", () => {
    expect(UNAVAILABLE_NOTE).toBe("Standard explanation. AI unavailable.");
    const html = renderToStaticMarkup(<AiExplanationView status="unavailable" text={explanation} mock={false} language="en" onLanguage={noop} />);
    expect(html).toContain("Standard explanation. AI unavailable.");
    expect(html).toContain(explanation.slice(0, 40));
    // and it must NOT claim the numbers were verified
    expect(html).not.toContain("numbers verified");
    expect(html).not.toContain("✓");
  });

  it("says it is working while the answer is on its way, and shows no old text", () => {
    const html = renderToStaticMarkup(<AiExplanationView status="loading" text="" mock={false} language="en" onLanguage={noop} />);
    expect(html).toContain("Preparing explanation");
    expect(html).not.toContain("numbers verified");
    expect(html).not.toContain(UNAVAILABLE_NOTE);
  });

  it("has an English / Hindi toggle with the chosen language marked", () => {
    const en = renderToStaticMarkup(<AiExplanationView status="verified" text="x" mock={false} language="en" onLanguage={noop} />);
    expect(en).toContain("English");
    expect(en).toContain("हिन्दी");
    expect(en).toMatch(/aria-pressed="true"[^>]*>English/);
    const hi = renderToStaticMarkup(<AiExplanationView status="verified" text="x" mock={false} language="hi" onLanguage={noop} />);
    expect(hi).toMatch(/aria-pressed="true"[^>]*>हिन्दी/);
    expect(hi).toContain('lang="hi"');
  });

  it("after the numbers change, shows the plain text and an Show explanation button, not the verified label", () => {
    const html = renderToStaticMarkup(
      <AiExplanationView status="stale" text={explanation} mock={false} language="en" onLanguage={noop} onExplain={noop} />,
    );
    expect(html).toContain("Show explanation");
    expect(html).toContain(esc(explanation));
    expect(html).not.toContain(VERIFIED_LABEL);
  });

  it.each([
    ["en", ["Do this", "Why this is cheapest", "Watch out"]],
    ["hi", ["यह करें", "यह सबसे सस्ता क्यों है", "ध्यान रखें"]],
  ] as const)("shows the three parts as labelled blocks (%s), with the verified label", (language, labels) => {
    const parts = templateExplanationParts(planFacts(result), language);
    const html = renderToStaticMarkup(
      <AiExplanationView status="verified" text="" parts={parts} mock={false} language={language} onLanguage={noop} />,
    );
    for (const label of labels) expect(html).toContain(label);
    for (const text of Object.values(parts)) expect(html).toContain(esc(text));
    expect(html).toContain(VERIFIED_LABEL);
    expect(html.indexOf(labels[0])).toBeLessThan(html.indexOf(labels[1]));
    expect(html.indexOf(labels[1])).toBeLessThan(html.indexOf(labels[2]));
  });

  it("an explanation answer must carry its three parts (an old saved answer without them is ignored)", () => {
    const parts = { doThis: "a", whyCheapest: "b", watchOut: "c" };
    expect(isExplainOutcome({ status: "verified", text: "a b c", parts })).toBe(true);
    expect(isExplainOutcome({ status: "verified", text: "a b c" })).toBe(false);
    expect(isExplainOutcome({ status: "verified", text: "x", parts: { doThis: "a" } })).toBe(false);
  });

  it("shows a 'Mock AI' badge in mock mode only", () => {
    expect(renderToStaticMarkup(<AiExplanationView status="verified" text="x" mock language="en" onLanguage={noop} />)).toContain("Mock AI");
    expect(renderToStaticMarkup(<AiExplanationView status="verified" text="x" mock={false} language="en" onLanguage={noop} />)).not.toContain("Mock AI");
  });

  it("recognises a well-formed answer from the server, and nothing else", () => {
    expect(isVerifiedTextOutcome({ status: "verified", text: "a" })).toBe(true);
    expect(isVerifiedTextOutcome({ status: "unavailable", text: "a" })).toBe(true);
    for (const bad of [null, {}, { status: "maybe", text: "a" }, { status: "verified" }, "x"]) expect(isVerifiedTextOutcome(bad)).toBe(false);
  });
});

describe("the call script on the 'Ask first' card", () => {
  const render = (over: Partial<Parameters<typeof CallScriptView>[0]> = {}) =>
    renderToStaticMarkup(
      <CallScriptView status="verified" text={script} mock={false} language="en" onLanguage={noop} onCopy={noop} copied={false} {...over} />,
    );

  it("shows the talking points as a list, with a Copy button and the language toggle", () => {
    const html = render();
    expect(html).toContain("<li>");
    expect(html).toContain("Copy");
    expect(html).toContain("English");
    expect(html).toContain("हिन्दी");
    expect(html).toContain("Ask for 15 extra days");
  });

  it("says it is for a phone call and that nothing is sent to the supplier", () => {
    expect(render()).toContain("Talking points for your call. Nothing is sent to the supplier.");
  });

  it("says the numbers were verified, or that the AI script was unavailable", () => {
    expect(SCRIPT_VERIFIED_LABEL).toBe("Figures checked against your plan");
    expect(render()).toContain(SCRIPT_VERIFIED_LABEL);
    expect(render({ status: "unavailable" })).toContain(SCRIPT_UNAVAILABLE_NOTE);
    expect(render({ status: "unavailable" })).not.toContain("verified");
  });

  it("confirms a copy", () => {
    expect(render({ copied: true })).toContain("Copied");
  });

  it("shows only a short message while it is being written", () => {
    const html = render({ status: "loading", text: "" });
    expect(html).toContain("Preparing");
    expect(html).not.toContain("<li>");
    expect(html).not.toContain("Copy");
  });
});

describe("the typed what-if box", () => {
  const html = renderToStaticMarkup(<WhatIfAsk onApply={noop} />);
  it("invites a question, with the two examples", () => {
    expect(html).toContain("Try a what-if");
    expect(html).toContain("What if sales drop 25%?");
    expect(html).toContain("What if the supplier gives 15 more days?");
  });
  it("caps the question at 300 characters", () => {
    expect(html).toContain('maxLength="300"');
  });
  it("starts with the Ask button off until there is a question", () => {
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Ask<\/button>/);
  });
  it("recognises a well-formed outcome from the server", () => {
    expect(isWhatIfOutcome({ status: "mapped" })).toBe(true);
    expect(isWhatIfOutcome({ status: "unmappable" })).toBe(true);
    expect(isWhatIfOutcome({ status: "rejected" })).toBe(true);
    expect(isWhatIfOutcome({ status: "error" })).toBe(true);
    for (const bad of [null, {}, { status: "applied" }, "x"]) expect(isWhatIfOutcome(bad)).toBe(false);
  });
});

describe("the language toggle", () => {
  it("offers exactly English and Hindi", () => {
    const html = renderToStaticMarkup(<LanguageToggle value="en" onChange={noop} />);
    expect((html.match(/<button/g) ?? []).length).toBe(2);
  });
});

describe("the results summary view", () => {
  const text = "You saved ₹11,310 compared with the usual way of borrowing.";
  it("shows the checked sentence with the verified label", () => {
    const html = renderToStaticMarkup(<ResultsSummaryView status="verified" text={text} mock={false} language="en" onLanguage={noop} />);
    expect(html).toContain(VERIFIED_LABEL);
    expect(html).toContain(text);
    expect(html).not.toContain("Mock AI");
    expect(html).not.toContain(UNAVAILABLE_NOTE);
  });
  it("shows the template with a note, and no verified label, when the AI was unavailable", () => {
    const html = renderToStaticMarkup(<ResultsSummaryView status="unavailable" text={text} mock={false} language="en" onLanguage={noop} />);
    expect(html).toContain(UNAVAILABLE_NOTE);
    expect(html).not.toContain(VERIFIED_LABEL);
  });
  it("shows a Mock AI badge in mock mode, a loading line, and an English/Hindi toggle", () => {
    expect(renderToStaticMarkup(<ResultsSummaryView status="verified" text={text} mock language="en" onLanguage={noop} />)).toContain("Mock AI");
    const loading = renderToStaticMarkup(<ResultsSummaryView status="loading" text="" mock={false} language="hi" onLanguage={noop} />);
    expect(loading).toContain("Summarising");
    expect(loading).toContain("हिन्दी");
    expect(loading).toContain('aria-pressed="true"');
  });
  it("marks Hindi text as Hindi", () => {
    expect(renderToStaticMarkup(<ResultsSummaryView status="verified" text="x" mock={false} language="hi" onLanguage={noop} />)).toContain('lang="hi"');
  });
});
