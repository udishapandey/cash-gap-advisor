"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { OUTCOME_IDS, type OutcomeId, type OutcomeResult } from "@/lib/engine/outcome";
import { formatINR, formatLakh, inrShort } from "@/lib/format";
import type { Language } from "@/lib/language";
import { dayLabel, forecastSaving } from "@/lib/plain";
import {
  gapRow,
  MID_SEASON_CAPTION,
  midSeasonForState,
  midSeasonView,
  nextTimeBullets,
  NEXT_TIME_CAPTION,
  outcomeForState,
  savedBreakdown,
  savedHeadline,
} from "@/lib/results";
import Disclosure from "./Disclosure";
import JourneyShell, { type ShellContext } from "./JourneyShell";
import ResultsSummary from "./ResultsSummary";
import { BTN, Badge, Card, Metric, PageHeader, Panel, SectionLabel, StatCard } from "./ui";

/** The chips for the three made-up seasons. */
const SEASON_CHIP: Record<OutcomeId, string> = { as_forecast: "As forecast", lower_15: "15% lower", higher_15: "15% higher" };

export default function ResultsScreen() {
  return <JourneyShell step="results">{(ctx) => <ResultsBody {...ctx} />}</JourneyShell>;
}

function ResultsBody({ state, result, update, reset }: ShellContext) {
  const router = useRouter();
  const [outcomeId, setOutcomeId] = useState<OutcomeId>("as_forecast");
  const o = useMemo(() => outcomeForState(result, state, outcomeId), [result, state, outcomeId]);
  const mid = useMemo(() => midSeasonForState(result, state), [result, state]);
  if (!o || !mid || state.chosenView === null) return null;

  const setLanguage = (language: Language) => update({ language });
  const view = midSeasonView(mid, (day) => dayLabel(result.recommended.invoice, day));
  const row = gapRow(o);
  const saved = o.cost.moneySaved;
  const chosen = state.chosenView === "right_sized" ? result.views.rightSized : result.views.keepFull;
  const chosenPlan = chosen.recommended.plan;
  const early = chosen.recommended.timing === "pay_early_for_discount";
  const done = {
    pay: chosenPlan.payAmount,
    discount: early ? chosen.discount.discountAmount : 0,
    cost: chosenPlan.totalCost,
    saving: forecastSaving(result, state.chosenView, state),
    repayments: chosenPlan.steps
      .filter((x) => x.isBorrowing)
      .map((x) => ({ label: x.optionId === "bank_overdraft" ? "Bank overdraft" : "Razorpay credit", amount: inrShort(x.amount), due: x.closedDay === null ? "-" : dayLabel(chosen.invoice, x.closedDay) })),
  };

  return (
    <>
      <PageHeader title="Results" crumbs={["Supplier bills"]} />

      <Panel aria-label="Supplier paid">
        <div className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div>
            <Badge tone="positive">Paid, simulated</Badge>
            <div className="mt-3">
              <Metric size="lg" label="Supplier paid" value={formatLakh(done.pay)} />
            </div>
          </div>
          <Metric size="lg" tone={done.saving > 0 ? "saved" : "plain"} label="Net benefit" value={formatINR(Math.max(0, done.saving))} />
        </div>
        <div className="grid gap-6 border-t border-line px-6 py-4 sm:grid-cols-3">
          <Metric label="Discount captured" value={formatINR(done.discount)} />
          <Metric label="Financing cost" value={formatINR(done.cost)} />
          <Metric label="Status" value="Repayments scheduled" />
        </div>
        {done.repayments.length > 0 && (
          <div className="overflow-x-auto border-t border-line px-6 py-3">
            <table className="w-full min-w-[22rem] text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="py-2 text-left font-medium">Repayment</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="py-2 text-right font-medium">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {done.repayments.map((r) => (
                  <tr key={r.label}>
                    <td className="py-2.5">{r.label}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.amount}</td>
                    <td className="py-2.5 text-right tabular-nums">{r.due}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Card aria-label="Mid-season check">
        <SectionLabel>{view.title}</SectionLabel>
        <p className="mt-1 text-sm text-muted">{view.intro}</p>
        <p className="mt-3 font-heading text-xl font-semibold">{view.headline}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
          {view.rows.map((r) => (
            <div key={r.label}>
              <dt className="text-xs text-muted">{r.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{r.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted">{view.cashInNote}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="py-2 text-left font-medium">Updated plan</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
                <th className="py-2 text-right font-medium">Saving</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {view.plans.map((p) => (
                <tr key={p.label}>
                  <td className="py-2">{p.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.cost}</td>
                  <td className="py-2 text-right tabular-nums">{p.saving}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm font-semibold">{view.verdict}</p>
        {view.verdictWhy && <p className="text-sm text-muted">{view.verdictWhy}</p>}
        {view.nothingChanges ? (
          <p className="mt-2 text-sm font-medium">{view.nothingChanges}</p>
        ) : (
          <>
            <h3 className="mt-4 text-sm font-semibold">What changes</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {view.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-3 text-xs text-muted">{MID_SEASON_CAPTION}</p>
      </Card>

      <div role="radiogroup" aria-label="Season" className="flex flex-wrap gap-2">
        {OUTCOME_IDS.map((id) => (
          <label
            key={id}
            className={`cursor-pointer rounded-md border px-3.5 py-1.5 text-sm ${
              outcomeId === id ? "border-brand bg-brand-faded font-semibold text-brand-text" : "border-line bg-card hover:bg-background"
            }`}
          >
            <input type="radio" name="outcome" value={id} checked={outcomeId === id} onChange={() => setOutcomeId(id)} className="sr-only" />
            {SEASON_CHIP[id]}
          </label>
        ))}
      </div>

      <StatCard label="Season outcome" value={savedHeadline(o)} tone={saved > 0 ? "saved" : "plain"}>
        <dl className="mt-4 divide-y divide-line text-sm">
          {savedBreakdown(o).map((r) => (
            <div key={r.label} className="flex justify-between py-2">
              <dt className="text-muted">{r.label}</dt>
              <dd className="font-medium tabular-nums">{r.value}</dd>
            </div>
          ))}
        </dl>
      </StatCard>

      <Card aria-label="Forecast against actual">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="py-2 text-left font-medium">Forecast gap</th>
              <th className="px-3 py-2 text-right font-medium">Actual gap</th>
              <th className="py-2 text-right font-medium">Difference</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 tabular-nums">{row.forecast}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.actual}</td>
              <td className="py-2 text-right tabular-nums">{row.difference}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card aria-label="Next time">
        <SectionLabel>Next time</SectionLabel>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
          {nextTimeBullets(o, state.salesDropPercent).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">{NEXT_TIME_CAPTION}</p>
      </Card>

      <Disclosure title="Details" lazy>
        <div className="space-y-6">
          <Details o={o} />
          <ResultsSummary
            state={state}
            view={state.chosenView}
            outcomeId={outcomeId}
            outcome={o}
            language={state.language}
            onLanguage={setLanguage}
          />
        </div>
      </Disclosure>

      <div>
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
    </>
  );
}

/** The cost table and the forecast bar. Plain rows: no sentences. */
function Details({ o }: { o: OutcomeResult }) {
  const { plan, default: def, moneySaved } = o.cost;
  const { forecastPairs: f, actualPairs, insideRange } = o.sales;
  const span = Math.max(1, f.high - f.low);
  const at = (n: number) => `${Math.min(100, Math.max(0, ((n - f.low) / span) * 100))}%`;

  const table = (title: string, rows: [string, string][]) => (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <dl className="mt-2 divide-y divide-line text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 py-2">
            <dt className="text-muted">{k}</dt>
            <dd className="font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );

  const costRows: [string, string][] = [["Interest and fees", formatINR(plan.fundsCost)]];
  if (plan.discountCaptured > 0) costRows.push(["Discount", formatINR(plan.discountCaptured)]);
  costRows.push(["Paying on the due date", formatINR(def.netCost)]);
  if (!def.coversWholeGap) costRows.push(["Unfunded on the due date", formatINR(def.uncovered)]);
  costRows.push([moneySaved >= 0 ? "Saved" : "Extra cost", formatINR(Math.abs(moneySaved))]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {table("Cost", costRows)}
      {table("Stock and cash", [
        ["Pairs wanted", String(actualPairs)],
        ["Pairs sold", String(o.stock.sold)],
        ["Pairs left", String(o.stock.leftOver)],
        ["Most owed", formatINR(o.borrowing.actual)],
        ["Extra credit used", formatINR(o.borrowing.extraCredit)],
      ])}
      <div className="lg:col-span-2">
        <h3 className="text-sm font-semibold">Forecast</h3>
        <div className="relative mt-4 h-2 rounded-full bg-slate-200" aria-hidden>
          <div className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-slate-500" style={{ left: at(f.expected) }} />
          <div
            className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${insideRange ? "bg-brand" : "bg-amber-500"}`}
            style={{ left: at(actualPairs) }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted tabular-nums">
          <span>Low {f.low}</span>
          <span>Expected {f.expected}</span>
          <span>High {f.high}</span>
        </div>
      </div>
    </div>
  );
}
