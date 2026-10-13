"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { formatINR, formatLakh, inrShort } from "@/lib/format";
import { dayLabel, forecastSaving } from "@/lib/plain";
import { gapRow, outcomeForState } from "@/lib/results";
import JourneyShell, { type ShellContext } from "./JourneyShell";
import { BTN, Badge, KeyValues, Metric, PageHeader, Panel, SectionLabel } from "./ui";

export default function ResultsScreen() {
  return <JourneyShell step="results">{(ctx) => <ResultsBody {...ctx} />}</JourneyShell>;
}

function ResultsBody({ state, result, reset }: ShellContext) {
  const router = useRouter();
  const o = useMemo(() => outcomeForState(result, state, "as_forecast"), [result, state]);
  if (!o || state.chosenView === null) return null;

  const chosen = state.chosenView === "right_sized" ? result.views.rightSized : result.views.keepFull;
  const plan = chosen.recommended.plan;
  const early = chosen.recommended.timing === "pay_early_for_discount";
  const saving = forecastSaving(result, state.chosenView, state);
  const discount = early ? chosen.discount.discountAmount : 0;
  const loans = plan.steps.filter((x) => x.isBorrowing).sort((a, b) => (a.closedDay ?? 1e9) - (b.closedDay ?? 1e9));
  const gap = gapRow(o);
  const onForecast = o.gap.difference === 0;

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
          <div className="grid gap-6 sm:grid-cols-3">
            <Metric label="Forecast cash gap" value={inrShort(o.gap.forecast)} />
            <Metric label="Actual (simulated)" value={inrShort(o.gap.actual)} />
            <Metric label="Result" value={onForecast ? "On forecast" : gap.difference} />
          </div>
          <p className="mt-4 text-xs text-muted">Sales and COD returns were close to forecast. This outcome improves the next estimate.</p>
        </div>
      </details>
    </>
  );
}
