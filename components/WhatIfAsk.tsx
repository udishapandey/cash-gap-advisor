"use client";

import { useState } from "react";
import { readAiCache, writeAiCache } from "@/lib/ai-cache";
import type { WhatIfOutcome } from "@/lib/ai";
import { hashInput } from "@/lib/hash";
import { applyWhatIf, normaliseQuestion, type AppliedWhatIf } from "@/lib/whatif";

const EXAMPLES = ["What if sales drop 25%?", "What if the supplier gives 15 more days?"];

export function isWhatIfOutcome(v: unknown): v is WhatIfOutcome {
  const s = (v as WhatIfOutcome | null)?.status;
  return s === "mapped" || s === "unmappable" || s === "rejected" || s === "error";
}

type Reply = { kind: "trace" | "message"; text: string; mock: boolean };

/** The saved answer for this question, or a fresh one from the server. Throws if the server can't be reached. */
async function outcomeFor(question: string): Promise<WhatIfOutcome> {
  const hash = await hashInput({ endpoint: "what-if", q: normaliseQuestion(question) });
  try {
    const saved = readAiCache(sessionStorage, hash, isWhatIfOutcome);
    if (saved) return saved;
  } catch {}
  const res = await fetch("/api/ai/what-if", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok || !isWhatIfOutcome(data.outcome)) throw new Error("bad response");
  const outcome: WhatIfOutcome = data.outcome;
  if (outcome.status === "mapped" && !outcome.mock) writeAiCache(sessionStorage, hash, outcome);
  return outcome;
}

/**
 * A text box for typed what-ifs. The AI only turns the question into up to four numbers. This component then applies
 * them (the slider, the extra-cash box, the bank rate, the supplier days) and the screen reruns the engine.
 */
export default function WhatIfAsk({ onApply }: { onApply: (applied: AppliedWhatIf) => void }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    setReply(null);
    try {
      const outcome = await outcomeFor(text);
      if (outcome.status === "mapped") {
        onApply(applyWhatIf(outcome.settings));
        setReply({ kind: "trace", text: outcome.trace, mock: outcome.mock });
      } else {
        setReply({ kind: "message", text: outcome.message, mock: "mock" in outcome ? outcome.mock : false });
      }
    } catch {
      setReply({ kind: "message", text: "Couldn't reach the AI service. Please try again.", mock: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <label htmlFor="what-if-question" className="text-sm font-medium">
        Ask a what-if
      </label>
      <form
        className="mt-1 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <input
          id="what-if-question"
          type="text"
          value={question}
          maxLength={300}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={`e.g. "What if sales drop 25%?" or "What if the supplier gives 15 more days?"`}
          className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {busy ? "Working it out…" : "Ask"}
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setQuestion(ex);
              void ask(ex);
            }}
            disabled={busy}
            className="rounded-full border border-line px-3 py-1 text-muted hover:bg-background disabled:opacity-50"
          >
            {ex}
          </button>
        ))}
      </div>
      <div aria-live="polite" className="mt-2 min-h-5 text-sm">
        {reply && (
          <p className={reply.kind === "trace" ? "text-green-800" : "text-muted"}>
            {reply.text}
            {reply.mock && (
              <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">Mock AI</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
