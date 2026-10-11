"use client";

import { useMemo } from "react";
import { aiStateFrom } from "@/lib/ai-requests";
import { resultsFacts } from "@/lib/ai-facts";
import { templateSummary } from "@/lib/ai-templates";
import type { VerifiedTextOutcome } from "@/lib/ai";
import type { OutcomeId, OutcomeResult } from "@/lib/engine/outcome";
import type { ViewId } from "@/lib/engine";
import type { JourneyState } from "@/lib/journey";
import type { Language } from "@/lib/language";
import { UNAVAILABLE_NOTE, VERIFIED_LABEL, isVerifiedTextOutcome } from "./AiExplanation";
import LanguageToggle from "./LanguageToggle";
import { useAiResource } from "./useAiResource";

/** What is on screen: the AI's checked sentence, or the plain template with a small note. Presentational only. */
export function ResultsSummaryView({
  status,
  text,
  mock,
  language,
  onLanguage,
}: {
  status: "loading" | "verified" | "unavailable";
  text: string;
  mock: boolean;
  language: Language;
  onLanguage: (l: Language) => void;
}) {
  return (
    <section aria-label="AI summary" className="rounded-xl border border-line bg-card shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">
            {status === "verified" && <span aria-hidden>✓ </span>}
            {status === "verified" ? VERIFIED_LABEL : "In one line"}
          </h3>
          {mock && <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">Mock AI</span>}
        </div>
        <LanguageToggle value={language} onChange={onLanguage} label="Summary language" />
      </div>
      {status === "loading" ? (
        <p className="mt-3 text-sm text-muted" aria-live="polite">
          Writing a one-line summary…
        </p>
      ) : (
        <p lang={language === "hi" ? "hi" : "en"} className="mt-3 text-sm leading-relaxed" aria-live="polite">
          {text}
        </p>
      )}
      {status === "unavailable" && <p className="mt-2 text-xs text-muted">{UNAVAILABLE_NOTE}</p>}
    </section>
  );
}

/**
 * A one-line summary of how the plan did, written by the AI from the outcome's numbers only. Every ₹, % and multiple in
 * it is checked on the server; if the AI is unavailable or fails the check, the plain template sentence is shown.
 */
export default function ResultsSummary({
  state,
  view,
  outcomeId,
  outcome,
  language,
  onLanguage,
}: {
  state: JourneyState;
  view: ViewId;
  outcomeId: OutcomeId;
  outcome: OutcomeResult;
  language: Language;
  onLanguage: (l: Language) => void;
}) {
  const request = useMemo(() => {
    const s = aiStateFrom(state);
    return s ? { state: s, view, outcome: outcomeId, language } : null;
  }, [state, view, outcomeId, language]);

  const resource = useAiResource<VerifiedTextOutcome>({
    endpoint: "/api/ai/results-summary",
    request,
    isValid: isVerifiedTextOutcome,
    isCacheable: (o) => o.status === "verified" && !o.mock,
    debounceMs: 300,
  });

  // If we couldn't even reach the server, build the same template here: it is plain code.
  const template = useMemo(() => templateSummary(resultsFacts(outcome), language), [outcome, language]);

  if (resource.status === "idle" || resource.status === "loading") {
    return <ResultsSummaryView status="loading" text="" mock={false} language={language} onLanguage={onLanguage} />;
  }
  if (resource.status === "failed") {
    return <ResultsSummaryView status="unavailable" text={template} mock={false} language={language} onLanguage={onLanguage} />;
  }
  const o = resource.value;
  return <ResultsSummaryView status={o.status} text={o.text} mock={o.mock} language={language} onLanguage={onLanguage} />;
}
