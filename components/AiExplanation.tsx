"use client";

import { useMemo } from "react";
import { aiStateFrom } from "@/lib/ai-requests";
import { planFacts } from "@/lib/ai-facts";
import { templateExplanation } from "@/lib/ai-templates";
import type { VerifiedTextOutcome } from "@/lib/ai";
import type { EngineResult } from "@/lib/engine";
import type { JourneyState } from "@/lib/journey";
import type { Language } from "@/lib/language";
import LanguageToggle from "./LanguageToggle";
import { useAiResource } from "./useAiResource";

export const VERIFIED_LABEL = "AI explanation — numbers verified against the calculation";
export const UNAVAILABLE_NOTE = "AI explanation unavailable";

export function isVerifiedTextOutcome(v: unknown): v is VerifiedTextOutcome {
  return (
    !!v &&
    typeof v === "object" &&
    ((v as VerifiedTextOutcome).status === "verified" || (v as VerifiedTextOutcome).status === "unavailable") &&
    typeof (v as VerifiedTextOutcome).text === "string"
  );
}

/** What is on screen: the AI's checked text, or the plain template with a small note. Presentational only. */
export function AiExplanationView({
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
    <section aria-label="AI explanation" className="rounded-xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {status === "verified" && (
            <h3 className="text-sm font-semibold">
              <span aria-hidden>✓ </span>
              {VERIFIED_LABEL}
            </h3>
          )}
          {status === "unavailable" && <h3 className="text-sm font-semibold">Plain explanation</h3>}
          {status === "loading" && <h3 className="text-sm font-semibold">Why this plan</h3>}
          {mock && (
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">Mock AI</span>
          )}
        </div>
        <LanguageToggle value={language} onChange={onLanguage} label="Explanation language" />
      </div>

      {status === "loading" ? (
        <p className="mt-3 text-sm text-muted" aria-live="polite">
          Writing a plain-language explanation…
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
 * "Why this plan" in plain words, from the AI, with every ₹ amount and % checked against the calculation on the
 * server. If the AI is unavailable or fails the check, the plain template is shown instead, with a small note.
 */
export default function AiExplanation({
  result,
  state,
  language,
  onLanguage,
}: {
  result: EngineResult;
  state: JourneyState;
  language: Language;
  onLanguage: (l: Language) => void;
}) {
  const request = useMemo(() => {
    const s = aiStateFrom(state);
    return s ? { state: s, language } : null;
  }, [state, language]);

  const resource = useAiResource<VerifiedTextOutcome>({
    endpoint: "/api/ai/explain",
    request,
    isValid: isVerifiedTextOutcome,
    isCacheable: (o) => o.status === "verified" && !o.mock,
    debounceMs: 600,
  });

  // If we couldn't even reach the server, build the same template here: it is plain code.
  const template = useMemo(() => templateExplanation(planFacts(result), language), [result, language]);

  if (resource.status === "idle" || resource.status === "loading") {
    return <AiExplanationView status="loading" text="" mock={false} language={language} onLanguage={onLanguage} />;
  }
  if (resource.status === "failed") {
    return <AiExplanationView status="unavailable" text={template} mock={false} language={language} onLanguage={onLanguage} />;
  }
  const o = resource.value;
  return <AiExplanationView status={o.status} text={o.text} mock={o.mock} language={language} onLanguage={onLanguage} />;
}
