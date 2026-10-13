"use client";

import Link from "next/link";
import type { GapResult, ScenarioResult } from "@/lib/engine/gap";
import { ESTIMATE_LINE, gapView } from "@/lib/plain";
import { formatINR } from "@/lib/format";
import Disclosure from "./Disclosure";
import JourneyShell from "./JourneyShell";
import NumberField from "./NumberField";
import RangeBar from "./RangeBar";
import Tabs from "./Tabs";
import { Alert, BTN, Badge, Card, Metric, PageHeader, Panel, SectionLabel } from "./ui";

type Row = { label: string; value: (s: ScenarioResult) => number; strong?: boolean; short?: boolean };

const SUMMARY: Row[] = [
  { label: "Cash coming in", value: (s) => s.cash.totalIn },
  { label: "Cash going out", value: (s) => s.cashOut },
  { label: "Cash short", value: (s) => s.gap, strong: true, short: true },
];

const CASH_IN: Row[] = [
  { label: "Bank balance", value: (s) => s.cash.bankBalance },
  { label: "Sales in transit", value: (s) => s.cash.settlementsInTransit },
  { label: "Forecast sales", value: (s) => s.cash.forecastPrepaid },
  { label: "COD after returns", value: (s) => s.cash.codPayouts },
  { label: "Other cash", value: (s) => s.cash.cashElsewhere },
  { label: "Total", value: (s) => s.cash.totalIn, strong: true },
];

const CASH_OUT: Row[] = [
  { label: "Supplier bill", value: (s) => s.invoiceDue },
  { label: "Other costs", value: (s) => s.otherOutflows },
  { label: "Total", value: (s) => s.cashOut, strong: true },
];

function Table({ rows, cols }: { rows: Row[]; cols: readonly (readonly [string, ScenarioResult])[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th className="px-3 py-2 text-left font-medium" />
            {cols.map(([name]) => (
              <th key={name} className="px-3 py-2 text-right font-medium">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.label} className={row.strong ? "font-semibold" : ""}>
              <td className="px-3 py-2">{row.label}</td>
              {cols.map(([name, s]) => {
                const v = row.value(s);
                return (
                  <td key={name} className={`px-3 py-2 text-right tabular-nums ${row.short && v > 0 ? "text-red-700" : ""}`}>
                    {formatINR(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function GapScreen() {
  return (
    <JourneyShell step="gap">
      {({ state, result, update }) => {
        const view = gapView(result);
        const gap = result.recommended.focusGap;
        return (
          <>
            <PageHeader title={view.headline} crumbs={["Supplier bills", "Cash gap"]} />

            <Panel aria-label={view.headline}>
              <div className="flex flex-wrap items-start justify-between gap-6 p-6">
                <div>
                <Metric
                  size="lg"
                  tone={gap.gapExpected > 0 ? "short" : "plain"}
                  label="Expected shortfall"
                  value={view.hero}
                  caption={view.duration ?? undefined}
                />
                <p className="mt-1 text-xs text-muted">{view.bufferLine}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">Forecast</Badge>
                  <Badge tone={view.lowConfidence ? "notice" : "neutral"}>{view.confidence}</Badge>
                </div>
              </div>
              {gap.gapMax > 0 && (
                <div className="border-t border-line px-6 py-4">
                  <RangeBar best={gap.gapMin} expected={gap.gapExpected} worst={gap.gapMax} />
                  <p className="mt-2 text-xs text-muted">{view.caption}</p>
                </div>
              )}
              <div className="grid gap-6 border-t border-line px-6 py-4 sm:grid-cols-3">
                {view.summary.map((c) => (
                  <Metric key={c.label} label={c.label} value={c.value} caption={c.caption} />
                ))}
              </div>
            </Panel>

            {view.dueLine && <Alert tone="positive">{view.dueLine}</Alert>}
            <p className="text-xs text-muted">{ESTIMATE_LINE}</p>

            <Disclosure title="How we estimated this">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[26rem] text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs text-muted">
                      <th className="py-2 text-left font-medium">Estimate</th>
                      <th className="px-3 py-2 text-left font-medium">Value</th>
                      <th className="py-2 text-left font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {view.estimates.map((e) => (
                      <tr key={e.label}>
                        <td className="py-2 font-medium">{e.label}</td>
                        <td className="px-3 py-2 tabular-nums">{e.value}</td>
                        <td className="py-2">
                          {e.source} <span className="text-muted">· Simulated</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-5">
                <Tabs
                  label="Cash gap detail"
                  tabs={[
                    { id: "summary", label: "Summary", content: <Table rows={SUMMARY} cols={cols(gap)} /> },
                    { id: "in", label: "Cash in", content: <Table rows={CASH_IN} cols={cols(gap)} /> },
                    { id: "out", label: "Cash out", content: <Table rows={CASH_OUT} cols={cols(gap)} /> },
                  ]}
                />
              </div>
            </Disclosure>

            <Card>
              <SectionLabel>Assumptions</SectionLabel>
              <div className="mt-3 grid gap-5 sm:grid-cols-2">
                <NumberField
                  id="cash-elsewhere"
                  label="Other available cash"
                  prefix="₹"
                  value={state.cashElsewhere}
                  onCommit={(v) => update({ cashElsewhere: v })}
                  max={1_000_000_000}
                />
                <NumberField
                  id="overdraft-rate"
                  label="Overdraft rate"
                  suffix="%"
                  value={state.overdraftRatePct}
                  onCommit={(v) => update({ overdraftRatePct: v })}
                  max={100}
                />
              </div>
            </Card>

            <div>
              <Link href="/options" className={BTN.primary}>
                See cheapest plan
              </Link>
            </div>
          </>
        );
      }}
    </JourneyShell>
  );
}

const cols = (gap: GapResult) =>
  [
    ["Low sales", gap.scenarios.low],
    ["Expected", gap.scenarios.expected],
    ["High sales", gap.scenarios.high],
  ] as const;
