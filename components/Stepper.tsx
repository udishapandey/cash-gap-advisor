"use client";

import Link from "next/link";
import { STEPS, stepAccess, stepStatus, type StepId } from "@/lib/journey";
import { useJourney } from "./JourneyProvider";

/** Bill, Cash gap, Plan, Approve, Results: a small line that says where you are, not a form to fill in. */
export default function Stepper({ current }: { current: StepId }) {
  const { state } = useJourney();
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs" aria-label="Decision journey">
      {STEPS.map((step, i) => {
        const status = stepStatus(state, step.id, current);
        const reason = stepAccess(state, step.id).reason;
        const tone =
          status === "current"
            ? "font-semibold text-brand-text"
            : status === "done"
              ? "text-subtle"
              : "text-muted";
        const label = (
          <span className={`flex items-center gap-1 whitespace-nowrap ${tone}`}>
            {status === "done" ? (
              <span aria-hidden className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-600 text-[9px] text-white">
                ✓
              </span>
            ) : status === "current" ? (
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
            ) : null}
            {step.label}
          </span>
        );
        return (
          <li key={step.id} className="flex items-center gap-1.5">
            {i > 0 && (
              <span aria-hidden className="text-line-strong">
                ›
              </span>
            )}
            {status === "locked" ? (
              <span title={reason} aria-disabled="true" className="cursor-not-allowed">
                {label}
              </span>
            ) : (
              <Link href={step.href} aria-current={status === "current" ? "step" : undefined} className="hover:underline">
                {label}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
