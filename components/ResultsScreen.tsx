"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { OUTCOME_IDS, type OutcomeId, type OutcomeResult } from "@/lib/engine/outcome";
import { formatINR } from "@/lib/format";
import type { Language } from "@/lib/language";
import { nextTimeBullets, outcomeForState, resultTiles, savedCard } from "@/lib/results";
import Disclosure from "./Disclosure";
import JourneyShell, { type ShellContext } from "./JourneyShell";
import ResultsSummary from "./ResultsSummary";
import { Card, StatCard } from "./ui";

/** The chips for the three made-up seasons. */
const SEASON_CHIP: Record<OutcomeId, string> = { as_forecast: "As forecast", lower_15: "15% lower", higher_15: "15% higher" };

export default function ResultsScreen() {
  return <JourneyShell step="results">{(ctx) => <ResultsBody {...ctx} />}</JourneyShell>;
}

function ResultsBody({ state, result, update, reset }: ShellContext) {
  const router = useRouter();
  const [outcomeId, setOutcomeId] = useState<OutcomeId>("as_forecast");
  const o = useMemo(() => outcomeForState(result, state, outcomeId), [result, state, outcomeId]);
  if (!o || state.chosenView === null) return null;

  const saved = savedCard(o);
  const setLanguage = (language: Language) => update({ language });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">After Diwali</h1>
        <div role="radiogroup" aria-label="Season" className="flex flex-wrap gap-2">
          {OUTCOME_IDS.map((id) => (
            <label
              key={id}
              className={`cursor-pointer rounded-full border px-3.5 py-1 text-sm ${
                outcomeId === id ? "border-brand bg-brand-faded font-semibold text-brand-text" : "border-line bg-card hover:bg-background"
              }`}
            >
              <input type="radio" name="outcome" value={id} checked={outcomeId === id} onChange={() => setOutcomeId(id)} className="sr-only" />
              {SEASON_CHIP[id]}
            </label>
          ))}
        </div>
      </div>

      <StatCard big label={saved.label} value={saved.value} caption={saved.caption} tone={saved.tone === "saved" ? "saved" : "plain"} />

      <div className="grid gap-4 sm:grid-cols-3">
        {resultTiles(o).map((t) => (
          <StatCard key={t.label} label={t.label} value={t.value} caption={t.caption || undefined} />
        ))}
      </div>

      <Card aria-label="Next time">
        <h2 className="text-base font-semibold">Next time</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
          {nextTimeBullets(o, state.salesDropPercent).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
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
            router.push("/invoice");
          }}
          className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
        >
          Plan another bill
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

  const costRows: [string, string][] = [["Your interest and fees", formatINR(plan.fundsCost)]];
  if (plan.discountCaptured > 0) costRows.push(["Discount", formatINR(plan.discountCaptured)]);
  costRows.push(["Usual way", formatINR(def.netCost)]);
  if (!def.coversWholeGap) costRows.push(["Usual way unfunded", formatINR(def.uncovered)]);
  costRows.push([moneySaved >= 0 ? "You saved" : "You paid extra", formatINR(Math.abs(moneySaved))]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {table("Cost", costRows)}
      {table("Stock and cash", [
        ["Pairs wanted", String(actualPairs)],
        ["Pairs sold", String(o.stock.sold)],
        ["Pairs left", String(o.stock.leftOver)],
        ["Most short", formatINR(o.borrowing.actualPeakNeed)],
        ["Borrowed", formatINR(o.borrowing.borrowed)],
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
