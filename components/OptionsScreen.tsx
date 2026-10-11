"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { merchant } from "@/lib/data/merchant";
import { runEngine, runWhatIf, type EngineInput, type EngineResult, type ViewId, type ViewResult } from "@/lib/engine";
import { CONFIG } from "@/lib/engine/config";
import type { FundingOption } from "@/lib/engine/options";
import { expectedLostMargin, type RightSizing } from "@/lib/engine/stock";
import { explainPlan } from "@/lib/explain";
import { formatINR, formatPct } from "@/lib/format";
import { SALES_DROPS, earlyPayDay, earlySettlementInsight, quoteOption } from "@/lib/journey";
import JourneyShell from "./JourneyShell";
import { Card, SectionTitle, SimulatedTag } from "./ui";

const dropLabel = (d: number) => (d === 0 ? "no change" : `−${d}%`);
const EXTENSION_CHOICES = [7, 15, 30] as const;

// ---------- What-if ----------

function WhatIf({
  input,
  drop,
  onChange,
  result,
}: {
  input: EngineInput;
  drop: number;
  onChange: (d: number) => void;
  result: EngineResult;
}) {
  // The engine is rerun for every sales drop, so the table and the slider always agree.
  const rows = useMemo(
    () => runWhatIf({ ...input, salesDropPercent: 0 }, [...SALES_DROPS]),
    [input.merchant, input.invoice, input.cashElsewhere, input.overdraftRatePct], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const { keepFull, rightSized } = result.views;
  return (
    <Card>
      <SectionTitle aside={<SimulatedTag />}>What if sales are lower?</SectionTitle>
      <p className="mt-1 text-sm text-muted">
        Slide to see how the loan changes. Keeping the full order needs more borrowing as sales fall. Ordering only
        what the forecast says will sell needs far less.
      </p>

      <div className="mt-5 max-w-md">
        <label htmlFor="sales-drop" className="text-sm font-medium">
          Sales change: <span className="font-semibold">{dropLabel(drop)}</span>
        </label>
        <input
          id="sales-drop"
          type="range"
          min={0}
          max={30}
          step={10}
          value={drop}
          aria-valuetext={dropLabel(drop)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="mt-2 w-full accent-[#3395ff]"
        />
        <div className="flex justify-between text-xs text-muted" aria-hidden>
          {SALES_DROPS.map((d) => (
            <span key={d}>{d === 0 ? "0%" : `−${d}%`}</span>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2" aria-live="polite">
        <div className="rounded-lg border border-line p-3">
          <p className="text-xs uppercase tracking-wide text-muted">Loan needed if you keep the full order</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatINR(keepFull.loan)}</p>
          <p className="text-xs text-muted">
            {keepFull.units} pairs · gap {formatINR(keepFull.gap.gapExpected)}
          </p>
        </div>
        <div className="rounded-lg border border-line p-3">
          <p className="text-xs uppercase tracking-wide text-muted">Loan needed if you right-size the order</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatINR(rightSized.loan)}</p>
          <p className="text-xs text-muted">
            {rightSized.units} pairs · gap {formatINR(rightSized.gap.gapExpected)}
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="px-3 py-2 text-left font-medium">Sales</th>
              <th className="px-3 py-2 text-right font-medium">Keep full: gap</th>
              <th className="px-3 py-2 text-right font-medium">Keep full: loan</th>
              <th className="px-3 py-2 text-right font-medium">Right-size: pairs</th>
              <th className="px-3 py-2 text-right font-medium">Right-size: loan</th>
              <th className="px-3 py-2 text-left font-medium">Recommended</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.salesDropPercent} className={r.salesDropPercent === drop ? "bg-blue-50 font-medium" : ""}>
                <td className="px-3 py-2">{dropLabel(r.salesDropPercent)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.keepFull.gapExpected)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.keepFull.loan)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.rightSized.units}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.rightSized.loan)}</td>
                <td className="px-3 py-2">{r.recommendedView === "right_sized" ? "Right-size" : "Keep full"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- The two plans ----------

function PlanCard({
  id,
  title,
  view,
  stock,
  drop,
  recommended,
  chosen,
  onChoose,
}: {
  id: ViewId;
  title: string;
  view: ViewResult;
  stock: RightSizing;
  drop: number;
  recommended: boolean;
  chosen: boolean;
  onChoose: () => void;
}) {
  const plan = view.recommended.plan;
  const early = view.recommended.timing === "pay_early_for_discount";
  const cut = stock.fullUnits - view.units;
  const reason =
    id === "right_sized"
      ? `${Math.round(stock.unsoldShare * 100)}% of the order is expected to stay unsold (over the ${Math.round(CONFIG.rightSizeUnsoldThreshold * 100)}% line)`
      : `Only ${Math.round(stock.unsoldShare * 100)}% of the order is expected to stay unsold`;

  return (
    <article
      aria-label={title}
      className={`flex flex-col rounded-xl border bg-card p-5 ${
        chosen ? "border-brand ring-2 ring-brand/30" : recommended ? "border-green-500" : "border-line"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">{title}</h3>
        {recommended && (
          <span title={reason} className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            Recommended
          </span>
        )}
        {chosen && <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">Your choice</span>}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Order</dt>
          <dd className="font-semibold tabular-nums">
            {view.units} pairs · {formatINR(view.orderValue)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">
            Peak shortfall to cover (any day up to day {early ? view.earlyGap.windowEnd : view.gap.windowEnd})
          </dt>
          <dd className="font-semibold tabular-nums">{formatINR(plan.gap)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Loan needed</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatINR(view.loan)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Total funding cost</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatINR(plan.totalCost)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-muted">
        {early
          ? `Pay by day ${earlyPayDay(view.invoice)} to get the ${view.invoice.earlyPayDiscountPct}% discount.`
          : `Pay on the due date (day ${view.invoice.dueInDays}).`}
      </p>
      {id === "right_sized" && (
        <p className="mt-1 text-xs text-muted">
          {cut > 0
            ? `Orders ${view.units} of ${stock.fullUnits} pairs and saves ${formatINR(cut * view.invoice.unitPrice)}.`
            : `All ${stock.fullUnits} pairs are expected to sell, so this is the same as keeping the full order.`}
        </p>
      )}

      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">How the gap is covered</h4>
      {plan.steps.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Nothing: you expect to have enough cash.</p>
      ) : (
        <ul className="mt-1 divide-y divide-line text-sm">
          {plan.steps.map((s) => (
            <li key={s.optionId} className="flex items-baseline justify-between gap-3 py-2">
              <span>
                {s.name}{" "}
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                    s.isBorrowing ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
                  }`}
                >
                  {s.isBorrowing ? "Loan" : "Not a loan"}
                </span>
              </span>
              <span className="text-right tabular-nums">
                {formatINR(s.amount)} <span className="text-xs text-muted">cost {formatINR(s.cost)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {!plan.fullyCovered && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          This plan covers only {formatINR(plan.covered)} of the gap. {formatINR(plan.uncovered)} is not covered.
        </p>
      )}

      <details className="mt-4 rounded-md border border-line px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">Why this plan</summary>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
          {explainPlan(view, stock, { salesDropPercent: drop }).map((line, i) => (
            <li key={i} className="whitespace-pre-wrap">
              {line}
            </li>
          ))}
        </ul>
      </details>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onChoose}
          disabled={!plan.fullyCovered}
          aria-pressed={chosen}
          className={`rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
            chosen ? "bg-brand text-white" : "border border-brand text-brand hover:bg-blue-50"
          }`}
        >
          {chosen ? "✓ Chosen" : "Choose this plan"}
        </button>
        {chosen && (
          <Link href="/approve" className="text-sm font-medium text-brand hover:underline">
            Continue to approve →
          </Link>
        )}
      </div>
    </article>
  );
}

// ---------- One card per option ----------

function CapNote({ option, view }: { option: FundingOption; view: ViewResult }) {
  switch (option.id) {
    case "early_settlement":
      return <>Cap {formatINR(option.maxAmount)}: sales already earned but not yet settled.</>;
    case "credit_line":
      return <>Cap {formatINR(option.maxAmount)}: pre-approved limit (simulated).</>;
    case "bank_overdraft":
      return <>Cap {formatINR(option.maxAmount)}: your overdraft limit (simulated).</>;
    case "split_order":
      return (
        <>
          Cap {formatINR(option.maxAmount)}: up to {Math.round(CONFIG.maxSplitShareOfInvoice * 100)}% of the order (
          {Math.round(option.maxAmount / view.invoice.unitPrice)} pairs).
        </>
      );
  }
}

function OptionCard({
  title,
  available,
  unavailableReason,
  costLine,
  coverLine,
  annualised,
  cap,
  insight,
  note,
  simulated,
}: {
  title: string;
  available: boolean;
  unavailableReason?: string;
  costLine: string;
  coverLine?: string;
  annualised: string;
  cap?: React.ReactNode;
  insight?: string | null;
  note?: string;
  simulated?: boolean;
}) {
  return (
    <article aria-label={title} className={`rounded-xl border border-line bg-card p-4 ${available ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
            available ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"
          }`}
        >
          {available ? "Available" : "Not available"}
        </span>
        {simulated && <SimulatedTag />}
      </div>
      <p className="mt-3 text-xl font-semibold tabular-nums">{costLine}</p>
      {coverLine && <p className="text-xs text-muted">{coverLine}</p>}
      <p className="mt-2 text-sm">
        Annualised: <strong>{annualised}</strong>
      </p>
      {cap && <p className="mt-1 text-xs text-muted">{cap}</p>}
      {!available && unavailableReason && <p className="mt-1 text-xs text-muted">{unavailableReason}</p>}
      {insight && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong>Looks cheap, isn&apos;t small: {insight}.</strong> The fee is tiny in rupees because the money only
          arrives {merchant.settlementDays} days sooner. Used for longer, it would cost far more.
        </p>
      )}
      {note && <p className="mt-3 text-xs text-muted">{note}</p>}
    </article>
  );
}

// ---------- Ask first ----------

function AskFirst({
  days,
  onDays,
  ask,
}: {
  days: number;
  onDays: (d: number) => void;
  ask: EngineResult;
}) {
  const rows = [
    ["Keep full order", ask.views.keepFull.askFirst],
    ["Right-size order", ask.views.rightSized.askFirst],
  ] as const;
  return (
    <section
      aria-label="Ask first: supplier extension"
      className="rounded-xl border-2 border-dashed border-slate-400 bg-card p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">Ask first: more time from the supplier</h2>
        <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-700">
          Not part of the plan
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        This is a request, not funding. The plans above never depend on it. If you call the supplier and they agree,
        this is how much borrowing it would remove.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Extra days to ask for">
        <span className="text-sm">If they agree to</span>
        {EXTENSION_CHOICES.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onDays(d)}
            aria-pressed={days === d}
            className={`rounded-md border px-3 py-1 text-sm ${
              days === d ? "border-brand bg-brand text-white" : "border-line hover:bg-background"
            }`}
          >
            {d} extra days
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="px-3 py-2 text-left font-medium">Plan</th>
              <th className="px-3 py-2 text-right font-medium">Borrowing if you pay on time</th>
              <th className="px-3 py-2 text-right font-medium">If the supplier agrees</th>
              <th className="px-3 py-2 text-right font-medium">Borrowing removed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(([name, a]) => (
              <tr key={name}>
                <td className="px-3 py-2">{name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatINR(a.borrowingIfPaidOnDueDate)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatINR(a.borrowingIfExtended)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {a.borrowingRemoved > 0 ? formatINR(a.borrowingRemoved) : "None: it wouldn't help"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted">
        Never pay late without agreement. For comparison only: missing the due date by {days} days would cost a late
        fee of {formatINR(ask.views.keepFull.askFirst.lateFeeIfMissed)} on the full order. That is the price of
        missing the date, not a way to pay.
      </p>
    </section>
  );
}

// ---------- The screen ----------

export default function OptionsScreen() {
  const [extensionDays, setExtensionDays] = useState<number>(CONFIG.extensionDays);

  return (
    <JourneyShell step="options">
      {({ state, input, result, update }) => (
        <OptionsBody
          state={state}
          input={input}
          result={result}
          update={update}
          extensionDays={extensionDays}
          setExtensionDays={setExtensionDays}
        />
      )}
    </JourneyShell>
  );
}

function OptionsBody({
  state,
  input,
  result,
  update,
  extensionDays,
  setExtensionDays,
}: {
  state: { salesDropPercent: number; chosenView: ViewId | null };
  input: EngineInput;
  result: EngineResult;
  update: (patch: { salesDropPercent?: number; chosenView?: ViewId | null }) => void;
  extensionDays: number;
  setExtensionDays: (d: number) => void;
}) {
  const { keepFull, rightSized } = result.views;
  const drop = state.salesDropPercent;
  const ask = useMemo(
    () => (extensionDays === CONFIG.extensionDays ? result : runEngine({ ...input, extensionDays })),
    [result, input, extensionDays],
  );

  // Every option is priced for the same job (covering the expected gap on the full order) so cards compare fairly.
  const gap = keepFull.gap.scenarios.expected.gap;
  const lost = expectedLostMargin({
    orderUnits: result.stock.fullUnits,
    unitsNotOrdered: result.stock.unitsCut,
    demandUnits: result.stock.demandByScenario[result.stock.basis],
  }).expectedLostMargin;
  const d = keepFull.discount;

  return (
    <>
      <WhatIf input={input} drop={drop} onChange={(v) => update({ salesDropPercent: v })} result={result} />

      <section aria-label="Two plans" className="space-y-3">
        <SectionTitle aside={<SimulatedTag />}>Choose a plan</SectionTitle>
        <p className="text-sm text-muted">
          Both are shown side by side with their real costs. Nothing is chosen for you. The green outline marks what
          the numbers favour.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <PlanCard
            id="keep_full"
            title="Keep full order"
            view={keepFull}
            stock={result.stock}
            drop={drop}
            recommended={result.recommendedView === "keep_full"}
            chosen={state.chosenView === "keep_full"}
            onChoose={() => update({ chosenView: "keep_full" })}
          />
          <PlanCard
            id="right_sized"
            title="Right-size order"
            view={rightSized}
            stock={result.stock}
            drop={drop}
            recommended={result.recommendedView === "right_sized"}
            chosen={state.chosenView === "right_sized"}
            onChoose={() => update({ chosenView: "right_sized" })}
          />
        </div>
      </section>

      <section aria-label="Every option" className="space-y-3">
        <SectionTitle aside={<SimulatedTag />}>Every option, side by side</SectionTitle>
        <p className="text-sm text-muted">
          Each card shows what that option alone would cost to cover the expected gap of {formatINR(gap)} on the full
          order (up to its cap). The cheapest in rupees is not always the cheapest per year, so both are shown.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {keepFull.options.map((o) => {
            const q = quoteOption(o, gap);
            return (
              <OptionCard
                key={o.id}
                title={o.name}
                available={q.available}
                unavailableReason={
                  o.id === "early_settlement"
                    ? "No sales are earned but unsettled by the payment day."
                    : "Nothing can be drawn from this option."
                }
                costLine={`${formatINR(q.cost)} to cover ${formatINR(q.covers)}`}
                coverLine={q.covers < gap ? `Covers ${formatINR(q.covers)} of the ${formatINR(gap)} gap: its cap.` : "Covers the whole gap."}
                annualised={o.annualisedPct === null ? "n/a: priced as lost margin" : `${formatPct(o.annualisedPct)} a year`}
                cap={<CapNote option={o} view={keepFull} />}
                insight={o.id === "early_settlement" ? earlySettlementInsight(o) : null}
                note={o.id === "split_order" ? o.note : undefined}
                simulated={o.id !== "split_order"}
              />
            );
          })}

          <OptionCard
            title="Right-size the order"
            available={result.stock.unitsCut > 0}
            unavailableReason="All pairs are expected to sell, so there is nothing to cut."
            costLine={`${formatINR(lost)} expected lost margin`}
            coverLine={`Saves ${formatINR(result.stock.cashSaved)} by ordering ${result.stock.recommendedUnits} of ${result.stock.fullUnits} pairs.`}
            annualised="n/a: not a loan"
            cap={`Recommended when more than ${Math.round(CONFIG.rightSizeUnsoldThreshold * 100)}% would stay unsold (now ${Math.round(result.stock.unsoldShare * 100)}%).`}
            note="It cuts only pairs the forecast says would not sell, so the expected lost margin is about zero."
          />

          <OptionCard
            title="Pay early for the discount"
            available={d.discountAmount > 0 && d.affordable}
            unavailableReason={d.discountAmount === 0 ? "No early-payment discount on this invoice." : "The confirmed sources can't cover the earlier, bigger gap."}
            costLine={
              d.extraFundingCost >= 0
                ? `${formatINR(d.extraFundingCost)} extra funding`
                : `${formatINR(-d.extraFundingCost)} less funding cost`
            }
            coverLine={`Saves ${formatINR(d.discountAmount)} if paid ${d.daysEarly} days early. Net ${d.netSaving >= 0 ? "saving" : "cost"} ${formatINR(Math.abs(d.netSaving))}.`}
            annualised="n/a: a saving, not a loan"
            note={d.worthIt ? "Worth it: the discount is bigger than the extra cost of finding the cash sooner." : "Not worth it on these numbers."}
          />
        </div>
      </section>

      <AskFirst days={extensionDays} onDays={setExtensionDays} ask={ask} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/gap" className="text-sm text-brand hover:underline">
          ← Back to the cash gap
        </Link>
        {state.chosenView ? (
          <Link href="/approve" className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white hover:opacity-90">
            Continue to approve →
          </Link>
        ) : (
          <span className="text-sm text-muted">Choose a plan above to continue.</span>
        )}
      </div>
    </>
  );
}
