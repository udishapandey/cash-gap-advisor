"use client";

import Link from "next/link";
import type { ScenarioResult } from "@/lib/engine/gap";
import { formatINR } from "@/lib/format";
import JourneyShell from "./JourneyShell";
import NumberField from "./NumberField";
import RangeBar from "./RangeBar";
import Tabs from "./Tabs";
import { Card, StatCard } from "./ui";

type Row = { label: string; value: (s: ScenarioResult) => number; strong?: boolean; short?: boolean };

const SUMMARY: Row[] = [
  { label: "Cash coming in", value: (s) => s.cash.totalIn },
  { label: "Cash going out", value: (s) => s.cashOut },
  { label: "Likely short", value: (s) => s.gap, strong: true, short: true },
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
        const gap = result.views.keepFull.gap;
        const { low, expected, high } = gap.scenarios;
        const cols = [
          ["Low sales", low],
          ["Expected", expected],
          ["High sales", high],
        ] as const;
        return (
          <>
            <header>
              <h1 className="font-heading text-2xl font-semibold">Cash gap</h1>
              <p className="mt-1 text-sm text-muted">How short you could be before the due date.</p>
            </header>

            <StatCard
              big
              tone="short"
              label="Likely short"
              value={formatINR(gap.gapExpected)}
              caption={gap.gapMax === 0 ? "Enough cash in every case" : `Could be ${formatINR(gap.gapMin)} to ${formatINR(gap.gapMax)}`}
            >
              {gap.gapMax > 0 && (
                <div className="mt-5">
                  <RangeBar best={gap.gapMin} expected={gap.gapExpected} worst={gap.gapMax} />
                </div>
              )}
              {gap.lowConfidence && (
                <span className="mt-4 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">Low confidence</span>
              )}
            </StatCard>

            <Card>
              <Tabs
                label="Cash gap detail"
                tabs={[
                  { id: "summary", label: "Summary", content: <Table rows={SUMMARY} cols={cols} /> },
                  { id: "in", label: "Cash in", content: <Table rows={CASH_IN} cols={cols} /> },
                  { id: "out", label: "Cash out", content: <Table rows={CASH_OUT} cols={cols} /> },
                ]}
              />
            </Card>

            <Card>
              <h2 className="text-sm font-semibold">Adjust</h2>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <NumberField
                  id="cash-elsewhere"
                  label="Other cash you can use"
                  prefix="₹"
                  value={state.cashElsewhere}
                  onCommit={(v) => update({ cashElsewhere: v })}
                  max={1_000_000_000}
                />
                <NumberField
                  id="overdraft-rate"
                  label="Your bank's overdraft rate"
                  suffix="%"
                  value={state.overdraftRatePct}
                  onCommit={(v) => update({ overdraftRatePct: v })}
                  max={100}
                />
              </div>
            </Card>

            <div>
              <Link href="/options" className="inline-block rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover">
                See funding plan
              </Link>
            </div>
          </>
        );
      }}
    </JourneyShell>
  );
}
