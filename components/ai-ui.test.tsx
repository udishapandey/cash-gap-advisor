import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { merchant } from "@/lib/data/merchant";
import { sampleInvoice } from "@/lib/data/invoice";
import { planFacts, scriptFacts } from "@/lib/ai-facts";
import { templateExplanation, templateScript } from "@/lib/ai-templates";
import { runEngine } from "@/lib/engine";
import { AiExplanationView, UNAVAILABLE_NOTE, VERIFIED_LABEL, isVerifiedTextOutcome } from "./AiExplanation";
import { CallScriptView, SCRIPT_UNAVAILABLE_NOTE, SCRIPT_VERIFIED_LABEL } from "./CallScriptPanel";
import LanguageToggle from "./LanguageToggle";
import WhatIfAsk, { isWhatIfOutcome } from "./WhatIfAsk";

const noop = () => {};
const result = runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: 30 });
const explanation = templateExplanation(planFacts(result), "en");
const view = result.views.keepFull;
const script = templateScript(scriptFacts(view.invoice, view.duePlan, { extensionDays: 15, borrowingRemovedRupees: 0 }), "en");

describe("the AI explanation on the Options screen", () => {
  it("is labelled 'AI explanation — numbers verified against the calculation' when the numbers checked out", () => {
    expect(VERIFIED_LABEL).toBe("AI explanation — numbers verified against the calculation");
    const html = renderToStaticMarkup(<AiExplanationView status="verified" text={explanation} mock={false} language="en" onLanguage={noop} />);
    expect(html).toContain("AI explanation — numbers verified against the calculation");
    expect(html).toContain(explanation.slice(0, 40));
    expect(html).not.toContain(UNAVAILABLE_NOTE);
  });

  it("shows the plain template with a small 'AI explanation unavailable' note when it didn't", () => {
    expect(UNAVAILABLE_NOTE).toBe("AI explanation unavailable");
    const html = renderToStaticMarkup(<AiExplanationView status="unavailable" text={explanation} mock={false} language="en" onLanguage={noop} />);
    expect(html).toContain("AI explanation unavailable");
    expect(html).toContain(explanation.slice(0, 40));
    // and it must NOT claim the numbers were verified
    expect(html).not.toContain("numbers verified");
    expect(html).not.toContain("✓");
  });

  it("says it is working while the answer is on its way, and shows no old text", () => {
    const html = renderToStaticMarkup(<AiExplanationView status="loading" text="" mock={false} language="en" onLanguage={noop} />);
    expect(html).toContain("Writing a plain-language explanation");
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
    expect(html).toContain("Ask first for 15 extra days");
  });

  it("says it is for a phone call and that nothing is sent to the supplier", () => {
    expect(render()).toContain("Talking points for your phone call. Nothing is sent to the supplier.");
  });

  it("says the numbers were verified, or that the AI script was unavailable", () => {
    expect(SCRIPT_VERIFIED_LABEL).toBe("Numbers verified against your invoice and plan");
    expect(render()).toContain(SCRIPT_VERIFIED_LABEL);
    expect(render({ status: "unavailable" })).toContain(SCRIPT_UNAVAILABLE_NOTE);
    expect(render({ status: "unavailable" })).not.toContain("verified");
  });

  it("confirms a copy", () => {
    expect(render({ copied: true })).toContain("Copied");
  });

  it("shows only a short message while it is being written", () => {
    const html = render({ status: "loading", text: "" });
    expect(html).toContain("Writing talking points");
    expect(html).not.toContain("<li>");
    expect(html).not.toContain("Copy");
  });
});

describe("the typed what-if box", () => {
  const html = renderToStaticMarkup(<WhatIfAsk onApply={noop} />);
  it("invites a question, with the two examples", () => {
    expect(html).toContain("Ask a what-if");
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
