"use client";

import { useMemo, useState } from "react";
import type { VerifiedTextOutcome } from "@/lib/ai";
import { scriptFacts } from "@/lib/ai-facts";
import { aiStateFrom } from "@/lib/ai-requests";
import { templateScript } from "@/lib/ai-templates";
import type { ViewId, ViewResult } from "@/lib/engine";
import type { JourneyState } from "@/lib/journey";
import type { Language } from "@/lib/language";
import { isVerifiedTextOutcome } from "./AiExplanation";
import LanguageToggle from "./LanguageToggle";
import { useAiResource } from "./useAiResource";

export const SCRIPT_VERIFIED_LABEL = "Figures checked against your plan";
export const SCRIPT_UNAVAILABLE_NOTE = "Standard script. AI unavailable.";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** The talking points on screen. Presentational only. */
export function CallScriptView({
  status,
  text,
  mock,
  language,
  onLanguage,
  onCopy,
  copied,
}: {
  status: "loading" | "verified" | "unavailable";
  text: string;
  mock: boolean;
  language: Language;
  onLanguage: (l: Language) => void;
  onCopy: () => void;
  copied: boolean;
}) {
  const points = text.split("\n").map((l) => l.replace(/^\s*-\s*/, "").trim()).filter(Boolean);
  return (
    <div aria-label="Call script" className="mt-5 rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Call script for the supplier</h3>
          {mock && <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">Mock AI</span>}
        </div>
        <LanguageToggle value={language} onChange={onLanguage} label="Call script language" />
      </div>
      <p className="mt-1 text-xs text-muted">
        Talking points for your call. Nothing is sent to the supplier.
      </p>

      {status === "loading" ? (
        <p className="mt-3 text-sm text-muted" aria-live="polite">
          Preparing…
        </p>
      ) : (
        <>
          <ul lang={language === "hi" ? "hi" : "en"} className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            {points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={onCopy} className="rounded-md border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-blue-50">
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <span className="text-xs text-muted" aria-live="polite">
              {status === "verified" ? `✓ ${SCRIPT_VERIFIED_LABEL}` : SCRIPT_UNAVAILABLE_NOTE}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Talking points for the founder's PHONE CALL to the supplier: ask for N extra days, or part-payment now and the rest
 * later. It is written only when asked for (to save the free AI allowance), and nothing is ever sent to the supplier.
 */
export default function CallScriptPanel({
  state,
  view,
  viewId,
  extensionDays,
  language,
  onLanguage,
  autoStart = false,
}: {
  state: JourneyState;
  view: ViewResult;
  viewId: ViewId;
  extensionDays: number;
  language: Language;
  onLanguage: (l: Language) => void;
  /** Write the script as soon as the panel appears, because the founder already asked for it. */
  autoStart?: boolean;
}) {
  const [requested, setRequested] = useState(autoStart);
  const [copied, setCopied] = useState(false);

  const request = useMemo(() => {
    const s = aiStateFrom(state, extensionDays);
    return requested && s ? { state: s, language, view: viewId } : null;
  }, [requested, state, extensionDays, language, viewId]);

  const resource = useAiResource<VerifiedTextOutcome>({
    endpoint: "/api/ai/call-script",
    request,
    isValid: isVerifiedTextOutcome,
    isCacheable: (o) => o.status === "verified" && !o.mock,
  });

  // The same plain script, built here, in case the server can't be reached.
  const template = useMemo(
    () =>
      templateScript(
        scriptFacts(view.invoice, view.duePlan, { extensionDays, borrowingRemovedRupees: view.askFirst.borrowingRemoved }),
        language,
      ),
    [view, extensionDays, language],
  );

  if (!requested) {
    return (
      <div aria-label="Call script" className="mt-5 rounded-lg border border-dashed border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Call script for the supplier</h3>
            <p className="mt-1 text-xs text-muted">Talking points for your call. Nothing is sent to the supplier.</p>
          </div>
          <LanguageToggle value={language} onChange={onLanguage} label="Call script language" />
        </div>
        <button
          type="button"
          onClick={() => setRequested(true)}
          className="mt-3 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
        >
          Get call script
        </button>
      </div>
    );
  }

  const status = resource.status === "ready" ? resource.value.status : resource.status === "failed" ? "unavailable" : "loading";
  const text = resource.status === "ready" ? resource.value.text : template;
  const mock = resource.status === "ready" && resource.value.mock;

  return (
    <CallScriptView
      status={status}
      text={text}
      mock={mock}
      language={language}
      onLanguage={onLanguage}
      copied={copied}
      onCopy={async () => {
        if (await copyText(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      }}
    />
  );
}
