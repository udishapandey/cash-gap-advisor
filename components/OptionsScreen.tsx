"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { runEngine, runWhatIf, type EngineInput, type EngineResult, type ViewId } from "@/lib/engine";
import { CONFIG } from "@/lib/engine/config";
import { formatINR } from "@/lib/format";
import { SALES_DROPS, type JourneyState } from "@/lib/journey";
import type { Language } from "@/lib/language";
import { buildHeroPlan, compareRows, dayByDay, forecastSaving, type HeroPlan } from "@/lib/plain";
import type { AppliedWhatIf } from "@/lib/whatif";
import AiExplanation from "./AiExplanation";
import CallScriptPanel from "./CallScriptPanel";
import Disclosure from "./Disclosure";
import JourneyShell from "./JourneyShell";
import Tabs from "./Tabs";
import WhatIfAsk from "./WhatIfAsk";
import { Card } from "./ui";

const dropLabel = (d: number) => (d === 0 ? "no change" : `−${d}%`);

// ---------- What-if ----------

function WhatIf({
  input,
  drop,
  onChange,
  ask,
}: {
  input: EngineInput;
  drop: number;
  onChange: (d: number) => void;
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
  return (
    <div>
      <div className="max-w-md">
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
        {custom && <p className="mt-1 text-xs text-muted">Custom {dropLabel(drop)}</p>}
      </div>

      {ask}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[26rem] text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="py-2 text-left font-medium">Sales</th>
              <th className="px-3 py-2 text-right font-medium">Short</th>
              <th className="px-3 py-2 text-right font-medium">Borrowed</th>
              <th className="py-2 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.salesDropPercent} className={r.salesDropPercent === drop ? "bg-blue-50 font-medium" : ""}>
                <td className="py-2">{dropLabel(r.salesDropPercent)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.keepFull.gapExpected)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.keepFull.loan)}</td>
                <td className="py-2 text-right tabular-nums">{formatINR(r.keepFull.planCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- The recommended plan ----------

/** Colours for the funding bar, in plan order. */
const BAR_COLOUR: Record<string, string> = {
  own_cash: "bg-green-600",
  early_settlement: "bg-brand",
  bank_overdraft: "bg-slate-500",
  credit_line: "bg-amber-500",
  split_order: "bg-slate-300",
};

function HeroCard({
  hero,
  uncovered,
  onApprove,
  onWhy,
}: {
  hero: HeroPlan;
  /** Rupees the plan still leaves uncovered. Zero in the normal case. */
  uncovered: number;
  onApprove: () => void;
  onWhy: () => void;
}) {
  return (
    <Card aria-label="Recommended plan" className="p-6">
      <h2 className="font-heading text-xl font-semibold">{hero.title}</h2>
      <p className={`mt-2 font-heading text-2xl font-semibold ${hero.saving > 0 ? "text-green-700" : "text-muted"}`}>{hero.caption}</p>
      <div
        role="img"
        aria-label={hero.rows.map((x) => `${x.label} ${formatINR(x.amount)}`).join(", ")}
        className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-slate-200"
      >
        {hero.rows.map((x) => (
          <div key={x.id} className={BAR_COLOUR[x.id]} style={{ width: `${x.share * 100}%` }} />
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[26rem] text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="py-2 text-left font-medium">Source</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-right font-medium">Repaid by</th>
              <th className="py-2 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {hero.rows.map((x) => (
              <tr key={x.id}>
                <td className="py-2">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${BAR_COLOUR[x.id]}`} />
                    {x.label}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatINR(x.amount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{x.repaidBy ?? "-"}</td>
                <td className="py-2 text-right tabular-nums">{formatINR(x.cost)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2">Total cost</td>
              <td />
              <td />
              <td className="py-2 text-right tabular-nums">{formatINR(hero.totalCost)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {hero.closingLine && <p className="mt-4 text-sm text-muted">{hero.closingLine}</p>}
      {hero.backup && <p className={`mt-3 text-sm ${hero.backup.warn ? "text-red-700" : "text-muted"}`}>{hero.backup.text}</p>}
      <p className="mt-3 text-xs text-muted">{hero.footer}</p>
      {uncovered > 0 && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {formatINR(uncovered)} not covered
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-5">
        <button
          type="button"
          onClick={onApprove}
          disabled={uncovered > 0}
          className="rounded-md bg-brand px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Review &amp; approve
        </button>
        <button type="button" onClick={onWhy} className="text-sm font-medium text-brand-text hover:underline">
          Why this plan
        </button>
      </div>
    </Card>
  );
}

// ---------- Ask the supplier for more days ----------

function AskCard({
  days,
  removed,
  script,
}: {
  days: number;
  removed: number;
  /** The call-script panel, shown once the founder asks for it. */
  script: (open: boolean) => ReactNode;
}) {
  const [showScript, setShowScript] = useState(false);
  return (
    <Card aria-label="Ask the supplier for more days">
      <h2 className="text-base font-semibold">Ask for more days</h2>
      <p className="mt-1 text-sm text-muted">{removed > 0 ? `${days} days could remove ${formatINR(removed)} of borrowing` : "Would not reduce borrowing"}</p>
      <button type="button" onClick={() => setShowScript(true)} className="mt-3 text-sm font-medium text-brand-text hover:underline">
        Get call script
      </button>
      {showScript && script(true)}
    </Card>
  );
}

// ---------- How we worked this out ----------

function DayTable({ result, viewId }: { result: EngineResult; viewId: ViewId }) {
  const { rows, total } = dayByDay(result, viewId);
  if (rows.length === 0) return <p className="text-sm text-muted">Nothing is borrowed, so there is no interest.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[26rem] text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th className="py-2 text-left font-medium">Date</th>
            <th className="px-3 py-2 text-right font-medium">Overdraft</th>
            <th className="px-3 py-2 text-right font-medium">Credit line</th>
            <th className="py-2 text-right font-medium">Interest that day</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.date}>
              <td className="py-2">{r.date}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.overdraft)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.credit)}</td>
              <td className="py-2 text-right tabular-nums">{r.interest}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-2">Total interest</td>
            <td />
            <td />
            <td className="py-2 text-right tabular-nums">{total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ---------- All options ----------

function OptionsTable({ result, viewId }: { result: EngineResult; viewId: ViewId }) {
  const rows = compareRows(result, viewId);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th className="py-2 text-left font-medium">Option</th>
            <th className="px-3 py-2 text-right font-medium">Covers</th>
            <th className="px-3 py-2 text-right font-medium">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-2 font-medium">{r.label}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.covers}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.cost}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- The screen ----------

export default function OptionsScreen() {
  const [extensionDays, setExtensionDays] = useState<number>(CONFIG.extensionDays);

  return (
    <JourneyShell step="options">
      {({ state, input, result, update }) => (
        <PlanBody
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

function PlanBody({
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
  const [whyOpen, setWhyOpen] = useState(false);
  const ask = useMemo(
    () => (extensionDays === CONFIG.extensionDays ? result : runEngine({ ...input, extensionDays })),
    [result, input, extensionDays],
  );

  // The plan the numbers favour. Nothing is chosen until the founder approves it.
  const recId = result.recommendedView;
  const recView = recId === "right_sized" ? rightSized : keepFull;
  const hero = buildHeroPlan(result, recId, forecastSaving(result, recId, state));

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

  const openWhy = () => {
    setWhyOpen(true);
    queueMicrotask(() => document.getElementById("why")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <>
      <h1 className="font-heading text-2xl font-semibold">Plan</h1>

      <HeroCard
        hero={hero}
        uncovered={recView.recommended.plan.uncovered}
        onApprove={() => {
          update({ chosenView: recId });
          router.push("/approve");
        }}
        onWhy={openWhy}
      />

      {whyOpen && (
        <Disclosure id="why" title="Why this plan" open onOpenChange={setWhyOpen}>
          <AiExplanation result={result} state={state} language={state.language} onLanguage={setLanguage} typedToken={typedToken} />
        </Disclosure>
      )}

      <Disclosure title="How we worked this out" lazy>
        <DayTable result={result} viewId={recId} />
      </Disclosure>

      {/* Only when paying on the due date would need borrowing: otherwise there is nothing to ask for. */}
      {recView.gap.gapExpected > 0 && (
        <AskCard
          days={extensionDays}
          removed={ask.views[recId === "right_sized" ? "rightSized" : "keepFull"].askFirst.borrowingRemoved}
          script={(open) => (
            <CallScriptPanel
              state={state}
              view={scriptView}
              viewId={scriptViewId}
              extensionDays={extensionDays}
              language={state.language}
              onLanguage={setLanguage}
              autoStart={open}
            />
          )}
        />
      )}

      <Card>
        <Tabs
          label="More about the plan"
          tabs={[
            { id: "options", label: "Compare options", content: <OptionsTable result={result} viewId={recId} /> },
            {
              id: "drop",
              label: "What if sales change",
              content: (
                <WhatIf
                  input={input}
                  drop={drop}
                  onChange={(v) => update({ salesDropPercent: v })}
                  ask={
                    <Disclosure title="Ask your own question" className="mt-5">
                      <WhatIfAsk onApply={applyTyped} />
                    </Disclosure>
                  }
                />
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
