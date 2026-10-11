"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { merchant } from "@/lib/data/merchant";
import { runEngine, runWhatIf, type EngineInput, type EngineResult, type ViewId, type ViewResult } from "@/lib/engine";
import { CONFIG } from "@/lib/engine/config";
import type { FundingOption } from "@/lib/engine/options";
import type { RightSizing } from "@/lib/engine/stock";
import { explainPlanTemplate } from "@/lib/explain";
import { formatINR, formatPct } from "@/lib/format";
import {
  SALES_DROPS,
  daysOut,
  earlyPayDay,
  earlySettlementWhy,
  overdraftFirstNote,
  SOURCE_TAGS,
  tenureDays,
  type JourneyState,
} from "@/lib/journey";
import type { Language } from "@/lib/language";
import {
  OPTION_LABEL,
  TERMS,
  buildHeroPlan,
  compareRows,
  daysFootnote,
  fewerPairsSameAsFull,
  forecastSaving,
  type HeroPlan,
} from "@/lib/plain";
import type { AppliedWhatIf } from "@/lib/whatif";
import AiExplanation from "./AiExplanation";
import StandbyLine from "./StandbyLine";
import CallScriptPanel from "./CallScriptPanel";
import Disclosure from "./Disclosure";
import JourneyShell from "./JourneyShell";
import WhatIfAsk from "./WhatIfAsk";
import { Card } from "./ui";

const dropLabel = (d: number) => (d === 0 ? "no change" : `−${d}%`);
const EXTENSION_CHOICES = [7, 15, 30] as const;

// ---------- What-if ----------

function WhatIf({
  input,
  drop,
  onChange,
  result,
  ask,
}: {
  input: EngineInput;
  drop: number;
  onChange: (d: number) => void;
  result: EngineResult;
  /** The typed what-if box. */
  ask: ReactNode;
}) {
  // A typed question can set a sales drop the slider has no stop for (for example 25%). It gets its own row.
  const custom = !(SALES_DROPS as readonly number[]).includes(drop);
  const drops = useMemo(() => (custom ? [...SALES_DROPS, drop].sort((a, b) => a - b) : [...SALES_DROPS]), [custom, drop]);
  // The engine is rerun for every sales drop, so the table and the slider always agree.
  const rows = useMemo(
    () => runWhatIf({ ...input, salesDropPercent: 0 }, drops),
    [input.merchant, input.invoice, input.cashElsewhere, input.overdraftRatePct, drops], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const { keepFull, rightSized } = result.views;
  return (
    <div>
      <p className="text-sm text-muted">
        Slide to see how the borrowing changes. Ordering only what is forecast to sell needs far less.
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
          value={Math.min(30, drop)}
          aria-valuetext={dropLabel(drop)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="mt-2 w-full accent-[#3395ff]"
        />
        <div className="flex justify-between text-xs text-muted" aria-hidden>
          {SALES_DROPS.map((d) => (
            <span key={d}>{d === 0 ? "0%" : `−${d}%`}</span>
          ))}
        </div>
        {custom && (
          <p className="mt-1 text-xs text-amber-800">
            Custom value from your question: {dropLabel(drop)}. Move the slider to go back to a preset.
          </p>
        )}
      </div>

      {ask}

      <div className="mt-5 grid gap-3 sm:grid-cols-2" aria-live="polite">
        <div className="rounded-lg border border-line p-3">
          <p className="text-xs uppercase tracking-wide text-muted">Borrowing if you keep the full order</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatINR(keepFull.loan)}</p>
          <p className="text-xs text-muted">
            {keepFull.units} pairs · short {formatINR(keepFull.gap.gapExpected)}
          </p>
        </div>
        <div className="rounded-lg border border-line p-3">
          <p className="text-xs uppercase tracking-wide text-muted">Borrowing if you order fewer pairs</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatINR(rightSized.loan)}</p>
          <p className="text-xs text-muted">
            {rightSized.units} pairs · short {formatINR(rightSized.gap.gapExpected)}
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="px-3 py-2 text-left font-medium">Sales</th>
              <th className="px-3 py-2 text-right font-medium">Short (full order)</th>
              <th className="px-3 py-2 text-right font-medium">Borrowing (full order)</th>
              <th className="px-3 py-2 text-right font-medium">Pairs to order</th>
              <th className="px-3 py-2 text-right font-medium">Borrowing (fewer pairs)</th>
              <th className="px-3 py-2 text-left font-medium">Best plan</th>
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
                <td className="px-3 py-2">{r.recommendedView === "right_sized" ? TERMS.orderFewer : "Keep full order"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
  // The options this plan was built from: loans run a few days longer when the plan pays early.
  const planOptions = early ? view.earlyOptions : view.options;
  const loanDays = tenureDays(view);
  const overdraftNote = overdraftFirstNote({ options: planOptions, steps: plan.steps, loanDays });
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
            {TERMS.peakShortfall} (up to day {early ? view.earlyGap.windowEnd : view.gap.windowEnd})
          </dt>
          <dd className="font-semibold tabular-nums">{formatINR(plan.gap)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Borrowing needed</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatINR(view.loan)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{TERMS.fundingCost}</dt>
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

      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">How it is covered</h4>
      {plan.steps.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Nothing: you expect to have enough cash.</p>
      ) : (
        <ul className="mt-1 divide-y divide-line text-sm">
          {plan.steps.map((s) => {
            const option = planOptions.find((o) => o.id === s.optionId);
            const days = option ? daysOut(option, merchant.settlementDays, loanDays) : null;
            const why =
              s.optionId === "early_settlement"
                ? earlySettlementWhy({ options: planOptions, amount: s.amount, settlementDays: merchant.settlementDays, loanDays })
                : null;
            return (
              <li key={s.optionId} className="py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span>
                    {OPTION_LABEL[s.optionId]}{" "}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        s.isBorrowing ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
                      }`}
                    >
                      {s.isBorrowing ? "Loan" : "Not a loan"}
                    </span>{" "}
                    <SourceTag id={s.optionId} />
                  </span>
                  <span className="text-right tabular-nums">
                    {formatINR(s.amount)} <span className="text-xs text-muted">interest and fees {formatINR(s.cost)}</span>
                  </span>
                </div>
                {option?.annualisedPct != null && days !== null && (
                  <p className="mt-0.5 text-xs text-muted">
                    Yearly rate {formatPct(option.annualisedPct)} (for comparison only) · needed for {days} days → {formatINR(s.cost)}
                  </p>
                )}
                {why && <p className="mt-1 rounded-md bg-green-50 px-2 py-1 text-xs text-green-900">{why}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {overdraftNote && <p className="mt-2 rounded-md bg-green-50 px-2 py-1 text-xs text-green-900">{overdraftNote}</p>}
      <StandbyLine view={view} />
      {!plan.fullyCovered && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          This plan covers only {formatINR(plan.covered)} of the gap. {formatINR(plan.uncovered)} is not covered.
        </p>
      )}

      <details className="mt-4 rounded-md border border-line px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">Why this plan</summary>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
          {explainPlanTemplate(view, stock, { salesDropPercent: drop }).map((line, i) => (
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

// ---------- Who provides a source ----------

/** Who provides a source: grey for Razorpay's, blue for the founder's own bank or supplier. */
function SourceTag({ id }: { id: FundingOption["id"] }) {
  const tag = SOURCE_TAGS[id];
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${tag.razorpay ? "bg-slate-100 text-slate-700" : "bg-blue-100 text-blue-800"}`}
    >
      {tag.label}
    </span>
  );
}

// ---------- The recommended plan: the answer ----------

/** Colours for the funding bar, in plan order. */
const BAR_COLOUR: Record<string, string> = {
  early_settlement: "bg-brand",
  bank_overdraft: "bg-slate-500",
  credit_line: "bg-amber-500",
  split_order: "bg-green-500",
};

function HeroCard({
  hero,
  view,
  planName,
  onApprove,
  onCompare,
}: {
  hero: HeroPlan;
  view: ViewResult;
  planName: string;
  onApprove: () => void;
  onCompare: () => void;
}) {
  const plan = view.recommended.plan;
  return (
    <Card aria-label="Recommended plan" className="border-l-4 border-l-green-500 p-6">
      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">Recommended: {planName}</span>
      <h2 className="mt-3 font-heading text-2xl font-semibold leading-snug">{hero.shortLine}</h2>
      {hero.coverNote && <p className="mt-1 text-sm text-muted">{hero.coverNote}</p>}

      <p className="mt-5 text-base font-semibold">{hero.coverIntro}</p>
      {hero.steps.length > 0 && (
        <>
          <div
            role="img"
            aria-label={hero.steps.map((x) => `${x.label} ${formatINR(x.amount)}`).join(", then ")}
            className="mt-3 flex h-4 w-full overflow-hidden rounded-full bg-slate-200"
          >
            {hero.steps.map((x) => (
              <div key={x.id} className={BAR_COLOUR[x.id]} style={{ width: `${x.share * 100}%` }} />
            ))}
          </div>
          <ol className="mt-3 space-y-1.5 text-sm">
            {hero.steps.map((x, i) => (
              <li key={x.id} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${BAR_COLOUR[x.id]}`} />
                  {i + 1}. {x.label}
                </span>
                <span className="font-semibold tabular-nums">{formatINR(x.amount)}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {hero.insight && <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">{hero.insight}</p>}

      <p className="mt-4 text-base font-semibold">{hero.payLine}</p>
      <p className="mt-1 text-xs text-muted">{hero.basis}</p>
      {hero.fewerPairsNote && <p className="mt-1 text-xs text-muted">{hero.fewerPairsNote}</p>}

      <StandbyLine view={view} compact />

      {!plan.fullyCovered && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          This plan covers only {formatINR(plan.covered)}. {formatINR(plan.uncovered)} is still not covered.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={onApprove}
          disabled={!plan.fullyCovered}
          className="rounded-md bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Approve this plan
        </button>
        <button type="button" onClick={onCompare} className="text-sm font-medium text-brand-text hover:underline">
          Compare other ways
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">You approve each step again on the next screen. Nothing is borrowed yet.</p>
    </Card>
  );
}

// ---------- Before you borrow: ask the supplier ----------

function SupplierNudge({
  days,
  onDays,
  borrowingRemoved,
  script,
}: {
  days: number;
  onDays: (d: number) => void;
  borrowingRemoved: number;
  /** The call-script panel. */
  script: ReactNode;
}) {
  // A typed question can ask for a number of days that isn't one of the buttons. Show it as well.
  const choices = (EXTENSION_CHOICES as readonly number[]).includes(days)
    ? [...EXTENSION_CHOICES]
    : [...EXTENSION_CHOICES, days].sort((a, b) => a - b);
  return (
    <section aria-label="Ask the supplier for more days" className="rounded-xl border-2 border-dashed border-slate-300 bg-card p-5">
      <h2 className="text-base font-semibold">Before you borrow: ask the supplier for more days</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Extra days to ask for">
        {choices.map((d) => (
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
      <p className="mt-3 text-sm font-medium">
        {borrowingRemoved > 0
          ? `If they agree to ${days} more days, you'd borrow ${formatINR(borrowingRemoved)} less.`
          : `${days} more days wouldn't reduce your borrowing here.`}
      </p>
      <p className="mt-1 text-xs text-muted">It&apos;s a request, not funding: the plan never counts on it. Never pay late without agreement.</p>
      {script}
    </section>
  );
}

// ---------- Compare every option ----------

function CompareTable({ result, viewId, view }: { result: EngineResult; viewId: ViewId; view: ViewResult }) {
  const rows = compareRows(result, viewId);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="px-3 py-2 text-left font-medium">Way to find the money</th>
              <th className="px-3 py-2 text-right font-medium">How much it covers</th>
              <th className="px-3 py-2 text-right font-medium">{TERMS.fundingCost}</th>
              <th className="px-3 py-2 text-right font-medium">{TERMS.yearlyRate}</th>
              <th className="px-3 py-2 text-right font-medium">Days</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className={r.available ? "" : "text-muted"}>
                <td className="px-3 py-2 font-medium">{r.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.covers}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.cost}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.yearly}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        Each row is priced for the {formatINR(view.recommended.plan.gap)} you could be short at the worst point, up to what it
        can give. {daysFootnote(view)}
      </p>
    </div>
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
  state: JourneyState;
  input: EngineInput;
  result: EngineResult;
  update: (patch: {
    salesDropPercent?: number;
    cashElsewhere?: number;
    overdraftRatePct?: number;
    chosenView?: ViewId | null;
    language?: Language;
  }) => void;
  extensionDays: number;
  setExtensionDays: (d: number) => void;
}) {
  const router = useRouter();
  const { keepFull, rightSized } = result.views;
  const drop = state.salesDropPercent;
  const [compareOpen, setCompareOpen] = useState(false);
  const ask = useMemo(
    () => (extensionDays === CONFIG.extensionDays ? result : runEngine({ ...input, extensionDays })),
    [result, input, extensionDays],
  );

  // The hero is the plan the numbers favour. Nothing is chosen until the founder clicks.
  const recId = result.recommendedView;
  const recView = recId === "right_sized" ? rightSized : keepFull;
  const saving = forecastSaving(result, recId, state);
  const hero = buildHeroPlan(result, recId, saving);
  const planName = recId === "right_sized" ? TERMS.orderFewer : "Keep the full order";
  const sameAsFull = fewerPairsSameAsFull(result);

  // The call script is about the plan the founder chose, or the one the numbers favour if they haven't chosen yet.
  const scriptViewId: ViewId = state.chosenView ?? recId;
  const scriptView = scriptViewId === "right_sized" ? rightSized : keepFull;
  const setLanguage = (language: Language) => update({ language });
  // A typed what-if only gives us numbers. Applying them reruns the engine, and the explanation follows.
  const [typedToken, setTypedToken] = useState(0);
  const applyTyped = (a: AppliedWhatIf) => {
    setTypedToken((n) => n + 1);
    if (Object.keys(a.patch).length > 0) update(a.patch);
    if (a.extensionDays !== undefined) setExtensionDays(a.extensionDays);
  };

  const openCompare = () => {
    setCompareOpen(true);
    queueMicrotask(() => document.getElementById("compare")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <>
      <HeroCard
        hero={hero}
        view={recView}
        planName={planName}
        onApprove={() => {
          update({ chosenView: recId });
          router.push("/approve");
        }}
        onCompare={openCompare}
      />

      <SupplierNudge
        days={extensionDays}
        onDays={setExtensionDays}
        borrowingRemoved={ask.views[recId === "right_sized" ? "rightSized" : "keepFull"].askFirst.borrowingRemoved}
        script={
          <CallScriptPanel
            state={state}
            view={scriptView}
            viewId={scriptViewId}
            extensionDays={extensionDays}
            language={state.language}
            onLanguage={setLanguage}
          />
        }
      />

      <Disclosure id="compare" title="Compare every option" open={compareOpen} onOpenChange={setCompareOpen}>
        <CompareTable result={result} viewId={recId} view={recView} />
        <h3 className="mt-6 text-sm font-semibold">The plans in detail</h3>
        <p className="mt-1 text-sm text-muted">Nothing is chosen for you. Pick a different plan here if you prefer it.</p>
        {sameAsFull && <p className="mt-2 text-sm text-muted">{hero.fewerPairsNote}</p>}
        <div className={`mt-3 grid gap-4 ${sameAsFull ? "" : "lg:grid-cols-2"}`}>
          <PlanCard
            id="keep_full"
            title="Keep full order"
            view={keepFull}
            stock={result.stock}
            drop={drop}
            recommended={recId === "keep_full"}
            chosen={state.chosenView === "keep_full"}
            onChoose={() => update({ chosenView: "keep_full" })}
          />
          {!sameAsFull && (
            <PlanCard
              id="right_sized"
              title={TERMS.orderFewer}
              view={rightSized}
              stock={result.stock}
              drop={drop}
              recommended={recId === "right_sized"}
              chosen={state.chosenView === "right_sized"}
              onChoose={() => update({ chosenView: "right_sized" })}
            />
          )}
        </div>
      </Disclosure>

      <Disclosure title="What if sales are lower?">
        <WhatIf
          input={input}
          drop={drop}
          onChange={(v) => update({ salesDropPercent: v })}
          result={result}
          ask={<WhatIfAsk onApply={applyTyped} />}
        />
      </Disclosure>

      <Disclosure title="Full AI explanation" lazy>
        <AiExplanation result={result} state={state} language={state.language} onLanguage={setLanguage} typedToken={typedToken} />
      </Disclosure>

      <div>
        <Link href="/gap" className="text-sm text-brand hover:underline">
          ← Back to the cash gap
        </Link>
      </div>
    </>
  );
}
