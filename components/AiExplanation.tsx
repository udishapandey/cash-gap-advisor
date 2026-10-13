"use client";

import { useMemo, useState } from "react";
import { aiStateFrom } from "@/lib/ai-requests";
import { stableStringify } from "@/lib/hash";
import { planFacts } from "@/lib/ai-facts";
import { PART_LABELS, templateExplanationParts, type ExplanationParts } from "@/lib/ai-templates";
import type { ExplainOutcome, VerifiedTextOutcome } from "@/lib/ai";
import type { EngineResult } from "@/lib/engine";
import type { JourneyState } from "@/lib/journey";
import type { Language } from "@/lib/language";
import LanguageToggle from "./LanguageToggle";
import { useAiResource } from "./useAiResource";

export const VERIFIED_LABEL = "AI-generated. Figures checked against the plan.";
export const SAVED_LABEL = "Saved explanation. Figures checked against the plan.";
export const UNAVAILABLE_NOTE = "AI is busy right now. Showing the standard explanation.";

export function isVerifiedTextOutcome(v: unknown): v is VerifiedTextOutcome {
  return (
    !!v &&
    typeof v === "object" &&
    ((v as VerifiedTextOutcome).status === "verified" || (v as VerifiedTextOutcome).status === "unavailable") &&
    typeof (v as VerifiedTextOutcome).text === "string"
  );
}

export function isExplainOutcome(v: unknown): v is ExplainOutcome {
  const p = (v as ExplainOutcome | null)?.parts;
  return (
    isVerifiedTextOutcome(v) &&
    !!p &&
    typeof p.doThis === "string" &&
    typeof p.whyCheapest === "string" &&
    typeof p.watchOut === "string"
  );
}

/** What is on screen: the AI's checked text, or the plain template with a small note. Presentational only. */
export function AiExplanationView({
  status,
  text,
  parts,
  mock,
  saved = false,
  language,
  onLanguage,
  onExplain,
}: {
  status: "loading" | "verified" | "unavailable" | "stale";
  text: string;
  /** The three labelled blocks. When missing, `text` is shown as one paragraph. */
  parts?: ExplanationParts;
  mock: boolean;
  /** The saved text of the demo plan, shown with no AI call. */
  saved?: boolean;
  language: Language;
  onLanguage: (l: Language) => void;
  /** Only for "stale": asks the AI to explain the plan as it is now. */
  onExplain?: () => void;
}) {
  return (
    <section aria-label="AI explanation" className="rounded-xl border border-line bg-card shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {status === "verified" && (
            <h3 className="text-sm font-semibold">
              <span aria-hidden>✓ </span>
              {saved ? SAVED_LABEL : VERIFIED_LABEL}
            </h3>
          )}
          {status === "unavailable" && <h3 className="text-sm font-semibold">Explanation</h3>}
          {(status === "loading" || status === "stale") && <h3 className="text-sm font-semibold">Why this plan</h3>}
          {mock && (
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">Mock AI</span>
          )}
        </div>
        <LanguageToggle value={language} onChange={onLanguage} label="Explanation language" />
      </div>

      {status === "loading" ? (
        <p className="mt-3 text-sm text-muted" aria-live="polite">
          Preparing explanation…
        </p>
      ) : parts ? (
        <dl lang={language === "hi" ? "hi" : "en"} className="mt-3 space-y-3 text-sm leading-relaxed" aria-live="polite">
          {(["doThis", "whyCheapest", "watchOut"] as const).map((k) => (
            <div key={k}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{PART_LABELS[language][k]}</dt>
              <dd className="mt-0.5">{parts[k]}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p lang={language === "hi" ? "hi" : "en"} className="mt-3 text-sm leading-relaxed" aria-live="polite">
          {text}
        </p>
      )}
      {status === "unavailable" && <p className="mt-2 text-xs text-muted">{UNAVAILABLE_NOTE}</p>}
      {status === "stale" && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onExplain}
            className="rounded-md border border-brand-border text-brand-text bg-white px-3 py-1.5 text-sm font-medium hover:bg-background"
          >
            Show explanation
          </button>
          <span className="text-xs text-muted">The numbers changed. This is the plain explanation; ask the AI to rewrite it.</span>
        </div>
      )}
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
  typedToken = 0,
}: {
  result: EngineResult;
  state: JourneyState;
  language: Language;
  onLanguage: (l: Language) => void;
  /** Goes up each time a typed what-if is applied: that asks for a fresh explanation by itself. */
  typedToken?: number;
}) {
  const aiState = useMemo(() => aiStateFrom(state), [state]);
  const stateKey = aiState ? stableStringify(aiState) : null;

  // The AI is asked once when the screen first loads, and again only when the founder asks: by clicking "Explain this
  // plan", by choosing a language, or by typing a what-if. Moving the slider or editing a number does not call it.
  const [armed, setArmed] = useState<{ stateKey: string | null; language: Language } | null>(() => ({ stateKey, language }));
  const [seenToken, setSeenToken] = useState(typedToken);
  if (seenToken !== typedToken) {
    setSeenToken(typedToken);
    setArmed({ stateKey, language });
  }
  const isArmed = !!armed && armed.stateKey === stateKey && armed.language === language;

  const request = useMemo(() => (aiState && isArmed ? { state: aiState, language } : null), [aiState, language, isArmed]);

  const resource = useAiResource<ExplainOutcome>({
    endpoint: "/api/ai/explain",
    request,
    isValid: isExplainOutcome,
    isCacheable: (o) => o.status === "verified" && !o.mock,
    debounceMs: 600,
  });

  // If we couldn't even reach the server, build the same template here: it is plain code.
  const template = useMemo(() => templateExplanationParts(planFacts(result), language), [result, language]);
  const templateText = [template.doThis, template.whyCheapest, template.watchOut].join(" ");

  const chooseLanguage = (l: Language) => {
    setArmed({ stateKey, language: l });
    onLanguage(l);
  };

  if (!isArmed) {
    return (
      <AiExplanationView
        status="stale"
        text={templateText}
        parts={template}
        mock={false}
        language={language}
        onLanguage={chooseLanguage}
        onExplain={() => setArmed({ stateKey, language })}
      />
    );
  }
  if (resource.status === "idle" || resource.status === "loading") {
    return <AiExplanationView status="loading" text="" mock={false} language={language} onLanguage={chooseLanguage} />;
  }
  if (resource.status === "failed") {
    return <AiExplanationView status="unavailable" text={templateText} parts={template} mock={false} language={language} onLanguage={chooseLanguage} />;
  }
  const o = resource.value;
  return <AiExplanationView status={o.status} text={o.text} parts={o.parts} mock={o.mock} saved={o.saved} language={language} onLanguage={chooseLanguage} />;
}
