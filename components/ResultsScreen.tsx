"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { formatINR, formatLakh, inrShort } from "@/lib/format";
import { dayLabel, forecastSaving } from "@/lib/plain";
import { forecastReview, outcomeForState } from "@/lib/results";
import { pickPlan } from "@/lib/plan-choice";
import JourneyShell, { type ShellContext } from "./JourneyShell";
import { BTN, Badge, KeyValues, Metric, PageHeader, Panel, SectionLabel } from "./ui";

export default function ResultsScreen() {
  return <JourneyShell step="results">{(ctx) => <ResultsBody {...ctx} />}</JourneyShell>;
}

function ResultsBody({ state, result, reset }: ShellContext) {
  const router = useRouter();
  const o = useMemo(() => outcomeForState(result, state, "as_forecast"), [result, state]);
  if (!o || state.chosenView === null) return null;

  const chosen = pickPlan(state.chosenView === "right_sized" ? result.views.rightSized : result.views.keepFull, state.planChoice);
  const plan = chosen.recommended.plan;
  const early = chosen.recommended.timing === "pay_early_for_discount";
  const saving = forecastSaving(result, state.chosenView, state);
  const discount = early ? chosen.discount.discountAmount : 0;
  const loans = plan.steps.filter((x) => x.isBorrowing).sort((a, b) => (a.closedDay ?? 1e9) - (b.closedDay ?? 1e9));
  const review = forecastReview(o, { low: chosen.focusGap.gapMin, high: chosen.focusGap.gapMax });

  return (
    <>
      <PageHeader title="Payment complete" crumbs={["Supplier bills"]} />

      <Panel aria-label="Payment complete">
        <div className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="positive">Supplier paid {formatLakh(plan.payAmount)}</Badge>
              <span className="text-xs text-muted">Simulated, no real money moved</span>
            </div>
            <div className="mt-4">
              <Metric size="lg" tone={saving > 0 ? "saved" : "plain"} label="Expected net benefit" value={formatINR(Math.max(0, saving))} />
            </div>
          </div>
        </div>
        <div className="border-t border-line px-6 py-2">
          <KeyValues
            rows={[
              ...(early ? [{ label: "Early-payment discount", value: `+${formatINR(discount)}` }] : []),
              { label: "Estimated financing cost", value: `${plan.totalCost > 0 ? "−" : ""}${formatINR(plan.totalCost)}` },
              { label: "Expected net benefit", value: formatINR(Math.max(0, saving)), strong: true },
            ]}
          />
        </div>
      </Panel>

      {loans.length > 0 && (
        <Panel aria-label="What happens next">
          <div className="px-6 pt-4">
            <SectionLabel>What happens next</SectionLabel>
          </div>
          <div className="px-6 py-2">
            <KeyValues
              rows={loans.map((x) => ({
                label: `${x.optionId === "bank_overdraft" ? "Bank overdraft" : "Razorpay credit"} ${inrShort(x.amount)}`,
                value: x.closedDay === null ? "Repay when cash allows" : `Repay by ${dayLabel(chosen.invoice, x.closedDay)}`,
              }))}
            />
          </div>
        </Panel>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => {
            reset();
            router.push("/");
          }}
          className={BTN.primary}
        >
          Done
        </button>
      </div>

      <details className="group text-sm">
        <summary className="cursor-pointer list-none font-medium text-brand-text marker:content-none hover:underline">How did the forecast perform?</summary>
        <div className="mt-3 rounded-lg border border-line bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium">{review.headline}</p>
            <Badge tone={review.verdictTone}>{review.verdict}</Badge>
          </div>

          <div className="mt-6" role="img" aria-label={`Forecast range ${review.bar.rangeText}. Expected ${review.bar.forecastValue}. Actual ${review.bar.actualValue}, simulated.`}>
            <div className="relative h-2 rounded-full bg-slate-100">
              <div className="absolute top-0 h-2 rounded-full bg-amber-200" style={{ left: `${review.bar.lowPct}%`, width: `${Math.max(0, review.bar.highPct - review.bar.lowPct)}%` }} />
              <span aria-hidden className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-navy" style={{ left: `${review.bar.forecastPct}%` }} />
              <span aria-hidden className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand" style={{ left: `${review.bar.actualPct}%` }} />
            </div>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-muted">Forecast range</dt>
                <dd className="font-medium tabular-nums">
                  {review.bar.rangeText}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-muted">
                  <span aria-hidden className="inline-block h-3 w-0.5 bg-navy" />
                  Expected
                </dt>
                <dd className="font-medium tabular-nums">{review.bar.forecastValue}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-muted">
                  <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-brand" />
                  Actual (simulated)
                </dt>
                <dd className="font-medium tabular-nums">{review.bar.actualValue}</dd>
              </div>
            </dl>
          </div>

          <ul className="mt-5 space-y-1.5 text-sm">
            {review.lines.map((l) => (
              <li key={l} className="flex gap-2">
                <span aria-hidden className="text-muted">
                  ›
                </span>
                {l}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">Sales and COD returns were close to forecast. This outcome improves the next estimate.</p>
        </div>
      </details>
    </>
  );
}
