"use client";

import Link from "next/link";
import { STEPS, stepAccess, stepStatus, type StepId } from "@/lib/journey";
import { useJourney } from "./JourneyProvider";

/** Invoice → Cash gap → Options → Approve. Steps you can't open yet are greyed out. */
export default function Stepper({ current }: { current: StepId }) {
  const { state } = useJourney();
  return (
    <ol className="flex items-center gap-2 overflow-x-auto pb-1" aria-label="Decision journey">
      {STEPS.map((step, i) => {
        const status = stepStatus(state, step.id, current);
        const reason = stepAccess(state, step.id).reason;
        const circle =
          status === "current"
            ? "bg-brand text-white"
            : status === "done"
              ? "bg-green-600 text-white"
              : status === "locked"
                ? "bg-line text-muted"
                : "border border-brand text-brand";
        const label = (
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${circle}`}>
              {status === "done" ? "✓" : i + 1}
            </span>
            <span className={`text-sm ${status === "current" ? "font-semibold" : status === "locked" ? "text-muted" : ""}`}>
              {step.label}
            </span>
          </span>
        );
        return (
          <li key={step.id} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden className="h-px w-6 bg-line sm:w-10" />}
            {status === "locked" ? (
              <span title={reason} aria-disabled="true" className="cursor-not-allowed">
                {label}
              </span>
            ) : (
              <Link href={step.href} aria-current={status === "current" ? "step" : undefined} className="hover:opacity-80">
                {label}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
