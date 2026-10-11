"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { OUTCOME_IDS, SIMULATED_OUTCOMES, type OutcomeId, type OutcomeResult } from "@/lib/engine/outcome";
import { formatINR } from "@/lib/format";
import {
  SAVING_BASIS,
  accuracyTile,
  borrowingNote,
  defaultCannotFund,
  heroBasis,
  heroHeadline,
  heroParts,
  learnedLines,
  outcomeForState,
  planCostLine,
  soldOutNote,
} from "@/lib/results";
import type { Language } from "@/lib/language";
import Disclosure from "./Disclosure";
import JourneyShell, { type ShellContext } from "./JourneyShell";
import ResultsSummary from "./ResultsSummary";
import { Card } from "./ui";

export default function ResultsScreen() {
  return <JourneyShell step="results">{(ctx) => <ResultsBody {...ctx} />}</JourneyShell>;
}

function ResultsBody({ state, result, update, reset }: ShellContext) {
  const router = useRouter();
  const [outcomeId, setOutcomeId] = useState<OutcomeId>("as_forecast");
  const o = useMemo(() => outcomeForState(result, state, outcomeId), [result, state, outcomeId]);
  if (!o || state.chosenView === null) return null;

  const planName = state.chosenView === "right_sized" ? "Order fewer pairs" : "Keep full order";
  const setLanguage = (language: Language) => update({ language });

  return (
    <>
      <header>
        <h2 className="font-heading text-2xl font-semibold">After Diwali: how did the plan do?</h2>
        <p className="mt-1 text-sm text-muted">
          You approved: <strong>{planName}</strong>. Pick a made-up season to see how it would have gone.
        </p>
      </header>

      <fieldset className="rounded-xl border border-line bg-card p-4 shadow-sm">
        <legend className="px-1 text-sm font-medium">Made-up season</legend>
        <div role="radiogroup" aria-label="Made-up season" className="mt-1 flex flex-wrap gap-2">
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
      <Tiles o={o} />
      <Learned o={o} salesDropPercent={state.salesDropPercent} />

      <Disclosure title="See how we worked this out" lazy>
        <div className="space-y-4">
          <ResultsSummary
            state={state}
            view={state.chosenView}
            outcomeId={outcomeId}
            outcome={o}
            language={state.language}
            onLanguage={setLanguage}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <CostCard o={o} />
            <ForecastCard o={o} />
            <StockCard o={o} />
            <BorrowingCard o={o} />
          </div>
        </div>
      </Disclosure>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => {
            reset();
            router.push("/invoice");
          }}
          className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
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
    <Card aria-label="Money saved" className={`p-6 ${saved >= 0 ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
      <p className="font-heading text-2xl font-semibold leading-snug sm:text-3xl">{heroHeadline(o)}</p>
      <p className="mt-2 text-base">{heroParts(o)}</p>
      <p className="mt-2 text-xs text-muted">{heroBasis(o)}</p>
    </Card>
  );
}

function Tile({ title, value, note, tone = "plain" }: { title: string; value: string; note: string; tone?: "plain" | "warn" }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
      <p className="text-xs text-muted">{title}</p>
      <p className="mt-1 font-heading text-xl font-semibold tabular-nums">{value}</p>
      <p className={`mt-1 text-xs ${tone === "warn" ? "text-red-700" : "text-muted"}`}>{note}</p>
    </div>
  );
}

function Tiles({ o }: { o: OutcomeResult }) {
  const saved = o.cost.moneySaved;
  const acc = accuracyTile(o);
  return (
    <section aria-label="Three numbers" className="grid gap-4 sm:grid-cols-3">
      <Tile title="Money saved" value={saved >= 0 ? formatINR(saved) : `${formatINR(-saved)} worse off`} note="Against the usual way" />
      <Tile
        title="Borrowed more than needed"
        value={formatINR(o.borrowing.unnecessary)}
        note={borrowingNote(o)}
        tone={o.borrowing.underFunded > 0 ? "warn" : "plain"}
      />
      <Tile title="Forecast accuracy" value={acc.value} note={acc.note} />
    </section>
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
        {formatINR(o.sales.actualRupees)} at the made-up price per pair.
      </p>
    </Card>
  );
}

function StockCard({ o }: { o: OutcomeResult }) {
  const s = o.stock;
  const soldOut = soldOutNote(o);
  return (
    <Card aria-label="Stock sold vs left over">
      <h3 className="text-sm font-semibold">Stock: sold vs left over</h3>
      <p className="mt-3 text-xl font-semibold tabular-nums">
        {s.sold} sold <span className="text-sm font-normal text-muted">of {s.ordered} ordered</span>
      </p>
      <p className="mt-1 text-sm">
        Left over: <strong className="tabular-nums">{s.leftOver} pairs</strong>
      </p>
      {soldOut && (
        <p className={`mt-2 rounded-md px-3 py-2 text-xs ${soldOut.neutral ? "bg-background text-muted" : "bg-amber-50 text-amber-900"}`}>
          {soldOut.text}
        </p>
      )}
      {s.leftOverIfFullOrder !== s.leftOver && (
        <p className="mt-2 text-xs text-muted">Had you kept the full order, {s.leftOverIfFullOrder} pairs would have been left over.</p>
      )}
    </Card>
  );
}

function CostCard({ o }: { o: OutcomeResult }) {
  const { plan, default: def, moneySaved, fromCheaperFunding } = o.cost;
  const row = "flex justify-between gap-3 py-1.5";
  const more = (n: number) => (n >= 0 ? formatINR(n) : `${formatINR(-n)} more`);
  return (
    <Card aria-label="Cost of funds">
      <h3 className="text-sm font-semibold">Interest and fees: your plan vs the usual way</h3>
      <dl className="mt-3 divide-y divide-line text-sm">
        <div className={row}>
          <dt>Your plan: total interest and fees</dt>
          <dd className="tabular-nums">{formatINR(plan.fundsCost)}</dd>
        </div>
        {plan.topUpCost > 0 && (
          <div className={`${row} text-xs text-muted`}>
            <dt>…including cash drawn from your backup</dt>
            <dd className="tabular-nums">{formatINR(plan.topUpCost)}</dd>
          </div>
        )}
        {plan.discountCaptured > 0 && (
          <div className={row}>
            <dt>Early-payment discount you got</dt>
            <dd className="tabular-nums">{formatINR(plan.discountCaptured)} off</dd>
          </div>
        )}
        <div className={`${row} text-xs text-muted`}>
          <dt>{planCostLine(o)}</dt>
        </div>
        <div className={`${row} font-medium`}>
          <dt>
            The usual way: {formatINR(def.credit.amount)} on the Razorpay credit line
            {def.overdraft.amount > 0 && ` + ${formatINR(def.overdraft.amount)} on your bank's overdraft`}, paid on the due date
          </dt>
          <dd className="tabular-nums">{formatINR(def.netCost)}</dd>
        </div>
        <div className={row}>
          <dt>Saved on interest and fees</dt>
          <dd className="tabular-nums">{more(fromCheaperFunding)}</dd>
        </div>
        <div className={row}>
          <dt>Saved by the early-payment discount</dt>
          <dd className="tabular-nums">{formatINR(plan.discountCaptured)}</dd>
        </div>
        <div className={`${row} font-semibold`}>
          <dt>Money saved</dt>
          <dd className="tabular-nums">{moneySaved >= 0 ? formatINR(moneySaved) : `${formatINR(-moneySaved)} worse off`}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted">{SAVING_BASIS} It takes no early-payment discount.</p>
      {!def.coversWholeGap && <p className="mt-1 text-xs text-amber-800">{defaultCannotFund(o)}</p>}
    </Card>
  );
}

function BorrowingCard({ o }: { o: OutcomeResult }) {
  const b = o.borrowing;
  return (
    <Card aria-label="Unnecessary borrowing">
      <h3 className="text-sm font-semibold">Borrowed more than needed</h3>
      <p className="mt-3 text-xl font-semibold tabular-nums">
        {formatINR(b.unnecessary)}{" "}
        <span className="text-sm font-normal text-muted">{b.unnecessary > 0 ? "more than the cash you really needed" : "borrowed beyond what you needed"}</span>
      </p>
      <p className="mt-1 text-sm text-muted">
        You borrowed {formatINR(b.borrowed)}. The cash need peaked at {formatINR(b.actualPeakNeed)} (the plan was built for{" "}
        {formatINR(b.plannedPeakNeed)}).
      </p>
      {b.underFunded > 0 && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          The real need was {formatINR(b.underFunded)} more than the plan covered.{" "}
          {b.drawnFromStandby > 0 && <>{formatINR(b.drawnFromStandby)} would have come from your backup (your unused credit limit). </>}
          {b.beyondStandby > 0 && <>{formatINR(b.beyondStandby)} is more than that backup could cover. </>}
          The cost is in the figures above.
        </p>
      )}
      {b.unnecessary === 0 && b.underFunded === 0 && <p className="mt-2 text-xs text-green-800">Every rupee borrowed was needed.</p>}
    </Card>
  );
}

function Learned({ o, salesDropPercent }: { o: OutcomeResult; salesDropPercent: number }) {
  return (
    <Card aria-label="What I learned">
      <h3 className="font-heading text-lg font-semibold">What I learned</h3>
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
