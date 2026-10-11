"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { STEPS, stepAccess, stepStatus, type StepId } from "@/lib/journey";
import { useJourney } from "./JourneyProvider";

/** The sidebar follows the journey: Dashboard, then Invoice → Cash gap → Options → Approve. */
export default function NavLinks() {
  const pathname = usePathname();
  const { state } = useJourney();
  const current = STEPS.find((s) => s.href === pathname)?.id ?? null;
  const base = "rounded-md px-3 py-2 text-sm";

  return (
    <nav className="flex flex-col gap-1 px-3" aria-label="Main">
      <Link
        href="/"
        aria-current={pathname === "/" ? "page" : undefined}
        className={`${base} ${pathname === "/" ? "bg-white/10 font-medium" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
      >
        Dashboard
      </Link>

      <p className="mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">Decision journey</p>
      <ol className="flex flex-col gap-1">
        {STEPS.map((step, i) => {
          const status = stepStatus(state, step.id as StepId, current);
          const content = (
            <span className="flex items-center gap-2.5">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  status === "done"
                    ? "bg-green-500 text-white"
                    : status === "current"
                      ? "bg-white text-navy"
                      : "border border-white/40 text-white/60"
                }`}
              >
                {status === "done" ? "✓" : i + 1}
              </span>
              {step.label}
            </span>
          );
          return (
            <li key={step.id}>
              {status === "locked" ? (
                <span
                  title={stepAccess(state, step.id as StepId).reason}
                  aria-disabled="true"
                  className={`${base} block cursor-not-allowed text-white/35`}
                >
                  {content}
                </span>
              ) : (
                <Link
                  href={step.href}
                  aria-current={status === "current" ? "step" : undefined}
                  className={`${base} block ${
                    status === "current" ? "bg-white/10 font-medium" : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
