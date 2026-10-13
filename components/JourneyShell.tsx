"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Invoice } from "@/lib/data/invoice";
import type { EngineInput, EngineResult } from "@/lib/engine";
import { STEPS, stepAccess, type JourneyState, type StepId } from "@/lib/journey";
import { useJourney, useJourneyEngine } from "./JourneyProvider";
import Stepper from "./Stepper";
import { BTN } from "./ui";

export interface ShellContext {
  state: JourneyState;
  invoice: Invoice;
  input: EngineInput;
  result: EngineResult;
  update: ReturnType<typeof useJourney>["update"];
  reset: ReturnType<typeof useJourney>["reset"];
}

/**
 * The frame around each journey screen: the stepper, and a guard that explains what to do first
 * when the screen's prerequisites are missing. Children only render once the engine has a result.
 */
export default function JourneyShell({
  step,
  children,
}: {
  step: StepId;
  children: (ctx: ShellContext) => ReactNode;
}) {
  const { state, ready, update, reset } = useJourney();
  const engine = useJourneyEngine();
  const access = stepAccess(state, step);
  // Where to send the founder to fix what is missing: the invoice, then a chosen plan, then approval.
  const fix = state.invoice === null ? STEPS[0] : state.chosenView === null ? STEPS[2] : STEPS[3];

  return (
    <div className="space-y-6">
      <Stepper current={step} />
      {!ready ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !access.reachable || !engine || !state.invoice ? (
        <section className="rounded-lg border border-line bg-card p-6">
          <h2 className="text-lg font-semibold">Not available yet</h2>
          <p className="mt-1 text-sm text-muted">{access.reason}</p>
          <Link
            href={fix.href}
            className={`mt-4 ${BTN.primary}`}
          >
            Go to {fix.label.toLowerCase()}
          </Link>
        </section>
      ) : (
        children({ state, invoice: state.invoice, input: engine.input, result: engine.result, update, reset })
      )}
    </div>
  );
}
