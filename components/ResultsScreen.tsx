"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { merchant } from "@/lib/data/merchant";
import { OUTCOME_IDS, SIMULATED_OUTCOMES, type OutcomeId, type OutcomeResult } from "@/lib/engine/outcome";
import { formatINR, formatSignedINR } from "@/lib/format";
import { heroLine, learnedLines, outcomeForState } from "@/lib/results";
import type { Language } from "@/lib/language";
import JourneyShell, { type ShellContext } from "./JourneyShell";
import ResultsSummary from "./ResultsSummary";
import { Card, SimulatedTag } from "./ui";

export default function ResultsScreen() {
  return <JourneyShell step="results">{(ctx) => <ResultsBody {...ctx} />}</JourneyShell>;
}

function ResultsBody({ state, result, update, reset }: ShellContext) {
  const router = useRouter();
  const [outcomeId, setOutcomeId] = useState<OutcomeId>("as_forecast");
  const o = useMemo(() => outcomeForState(result, state, outcomeId), [result, state, outcomeId]);
  if (!o || state.chosenView === null) return null;

  const planName = state.chosenView === "right_sized" ? "Right-size order" : "Keep full order";
  const setLanguage = (language: Language) => update({ language });

  return (
    <>
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold">After Diwali: how did the plan do?</h2>
        <SimulatedTag>Simulated outcome</SimulatedTag>
      </header>
      <p className="-mt-3 text-sm text-muted">
        You approved: <strong>{planName}</strong>. Nothing below really happened: pick a made-up season to see how the
        plan would have done.
      </p>

      <fieldset className="rounded-xl border border-line bg-card p-4">
        <legend className="px-1 text-sm font-medium">
          Simulated actual outcome <SimulatedTag />
        </legend>
        <div role="radiogroup" aria-label="Simulated actual outcome" className="mt-1 flex flex-wrap gap-2">
          {OUTCOME_IDS.map((id) => (
            <label
              key={id}
              className={`cursor-pointer rounded-md border px-4 py-2 text-sm ${
                outcomeId === id ? "border-brand bg-brand text-white" : "border-line bg-white hover:bg-background"
              }`}
            >
              <input
                type="radio"
                name="outcome"
                value={id}
                checked={outcomeId === id}
                onChange={() => setOutcomeId(id)}
                className="sr-only"
              />
              {SIMULATED_OUTCOMES[id].label}
            </label>
          ))}
        </div>
      </fieldset>

      <Hero o={o} />

      <ResultsSummary
        state={state}
        view={state.chosenView}
        outcomeId={outcomeId}
        outcome={o}
        language={state.language}
        onLanguage={setLanguage}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ForecastCard o={o} />
        <StockCard o={o} />
        <CostCard o={o} />
        <BorrowingCard o={o} />
      </div>

      <Learned o={o} salesDropPercent={state.salesDropPercent} />

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => {
            reset();
            router.push("/invoice");
          }}
          className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          Start a new invoice
        </button>
      </div>
    </>
  );
}

function Hero({ o }: { o: OutcomeResult }) {
  const saved = o.cost.moneySaved;
  return (
    <Card aria-label="Money saved" className={saved >= 0 ? "border-green-300 bg-green-50/60" : "border-red-300 bg-red-50/60"}>
      <p className="text-2xl font-semibold leading-snug sm:text-3xl">{heroLine(o)}</p>
      <p className="mt-2 text-sm text-muted">
        Drawing the whole gap on the credit line would have cost {formatINR(o.cost.default.netCost)}. Your plan cost{" "}
        {formatSignedINR(o.cost.plan.netCost)}
        {o.cost.plan.discountCaptured > 0 && ` (after earning a ${formatINR(o.cost.plan.discountCaptured)} early-payment discount)`}.
      </p>
    </Card>
  );
}

const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

function ForecastCard({ o }: { o: OutcomeResult }) {
  const { forecastPairs: f, actualPairs, vsForecastPercent, insideRange } = o.sales;
  const span = Math.max(1, f.high - f.low);
  const at = (n: number) => `${Math.min(100, Math.max(0, ((n - f.low) / span) * 100))}%`;
  return (
    <Card aria-label="Forecast vs actual">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Forecast vs actual</h3>
        <SimulatedTag />
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            insideRange ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
          }`}
        >
          {insideRange ? "Inside the forecast range" : "Outside the forecast range"}
        </span>
      </div>
      <p className="mt-3 text-xl font-semibold tabular-nums">
        {actualPairs} pairs <span className="text-sm font-normal text-muted">wanted ({sign(vsForecastPercent)}% vs expected)</span>
      </p>
      <div className="relative mt-4 h-2 rounded-full bg-slate-200" aria-hidden>
        <div className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-slate-500" style={{ left: at(f.expected) }} />
        <div
          className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${
            insideRange ? "bg-green-600" : "bg-amber-500"
          }`}
          style={{ left: at(actualPairs) }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted tabular-nums">
        <span>Low {f.low}</span>
        <span>Expected {f.expected}</span>
        <span>High {f.high}</span>
      </div>
      <p className="mt-3 text-xs text-muted">
        In rupees: forecast {formatINR(o.sales.forecastRupees.low)} to {formatINR(o.sales.forecastRupees.high)}, actual{" "}
        {formatINR(o.sales.actualRupees)} at the simulated price per pair.
      </p>
    </Card>
  );
}

function StockCard({ o }: { o: OutcomeResult }) {
  const s = o.stock;
  return (
    <Card aria-label="Stock sold vs left over">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Stock: sold vs left over</h3>
        <SimulatedTag />
      </div>
      <p className="mt-3 text-xl font-semibold tabular-nums">
        {s.sold} sold <span className="text-sm font-normal text-muted">of {s.ordered} ordered</span>
      </p>
      <p className="mt-1 text-sm">
        Left over: <strong className="tabular-nums">{s.leftOver} pairs</strong>
      </p>
      {s.missedPairs > 0 && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          You sold out: customers wanted about {s.missedPairs} more pairs than the order covered.
        </p>
      )}
      {s.leftOverIfFullOrder !== s.leftOver && (
        <p className="mt-2 text-xs text-muted">
          Had you kept the full order, {s.leftOverIfFullOrder} pairs would have been left over.
        </p>
      )}
    </Card>
  );
}

function CostCard({ o }: { o: OutcomeResult }) {
  const { plan, default: def, moneySaved } = o.cost;
  const row = "flex justify-between gap-3 py-1.5";
  return (
    <Card aria-label="Cost of funds">
      <h3 className="text-sm font-semibold">Cost of funds: your plan vs the default</h3>
      <dl className="mt-3 divide-y divide-line text-sm">
        <div className={row}>
          <dt>Your plan: funding cost</dt>
          <dd className="tabular-nums">{formatINR(plan.fundsCost)}</dd>
        </div>
        {plan.topUpCost > 0 && (
          <div className={`${row} text-xs text-muted`}>
            <dt>…including a top-up for cash the plan left uncovered</dt>
            <dd className="tabular-nums">{formatINR(plan.topUpCost)}</dd>
          </div>
        )}
        {plan.discountCaptured > 0 && (
          <div className={row}>
            <dt>Early-payment discount earned</dt>
            <dd className="tabular-nums">−{formatINR(plan.discountCaptured)}</dd>
          </div>
        )}
        <div className={`${row} font-medium`}>
          <dt>Your plan, net</dt>
          <dd className="tabular-nums">{formatSignedINR(plan.netCost)}</dd>
        </div>
        <div className={`${row} font-medium`}>
          <dt>Default: {formatINR(def.amount)} on the credit line, pay on the due date</dt>
          <dd className="tabular-nums">{formatINR(def.netCost)}</dd>
        </div>
        <div className={`${row} font-semibold`}>
          <dt>Money saved</dt>
          <dd className="tabular-nums">{formatSignedINR(moneySaved)}</dd>
        </div>
      </dl>
      {def.exceedsCreditLimit && (
        <p className="mt-2 text-xs text-muted">
          The default would need more than your {formatINR(merchant.creditLineLimit)} credit limit, so it could not really have been drawn:
          it is shown only as the comparison.
        </p>
      )}
    </Card>
  );
}

function BorrowingCard({ o }: { o: OutcomeResult }) {
  const b = o.borrowing;
  return (
    <Card aria-label="Unnecessary borrowing">
      <h3 className="text-sm font-semibold">Unnecessary borrowing</h3>
      <p className="mt-3 text-xl font-semibold tabular-nums">
        {formatINR(b.unnecessary)}{" "}
        <span className="text-sm font-normal text-muted">borrowed beyond what you really needed</span>
      </p>
      <p className="mt-1 text-sm text-muted">
        You borrowed {formatINR(b.borrowed)}. The cash need peaked at {formatINR(b.actualPeakNeed)} (the plan was built for{" "}
        {formatINR(b.plannedPeakNeed)}).
      </p>
      {b.underFunded > 0 && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          The real need was {formatINR(b.underFunded)} more than the plan covered. You would have needed a top-up; its cost is
          in the figures above.
        </p>
      )}
      {b.unnecessary === 0 && b.underFunded === 0 && (
        <p className="mt-2 text-xs text-green-800">Every rupee borrowed was needed.</p>
      )}
    </Card>
  );
}

function Learned({ o, salesDropPercent }: { o: OutcomeResult; salesDropPercent: number }) {
  return (
    <Card aria-label="What I learned">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold">What I learned</h3>
        <SimulatedTag />
      </div>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
        {learnedLines(o, salesDropPercent).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">
        I move each estimate halfway toward what I saw, so one season does not swing it too far.
      </p>
    </Card>
  );
}
