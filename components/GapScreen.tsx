"use client";

import Link from "next/link";
import { merchant } from "@/lib/data/merchant";
import { CONFIG } from "@/lib/engine/config";
import type { ScenarioResult } from "@/lib/engine/gap";
import { formatINR } from "@/lib/format";
import JourneyShell from "./JourneyShell";
import NumberField from "./NumberField";
import RangeBar from "./RangeBar";
import { Card, LowConfidenceBadge, SectionTitle, SimulatedTag } from "./ui";

type Row = { label: string; tag?: "Simulated" | "Your input"; value: (s: ScenarioResult) => number };

const ROWS: Row[] = [
  { label: "Bank balance today", tag: "Simulated", value: (s) => s.cash.bankBalance },
  { label: "Prepaid sales already in transit", tag: "Simulated", value: (s) => s.cash.settlementsInTransit },
  { label: "Forecast prepaid sales that settle in time", tag: "Simulated", value: (s) => s.cash.forecastPrepaid },
  {
    label: `COD in transit, minus expected returns (${Math.round(merchant.codReturnRate * 100)}%)`,
    tag: "Simulated",
    value: (s) => s.cash.codPayouts,
  },
  { label: "Cash available elsewhere", tag: "Your input", value: (s) => s.cash.cashElsewhere },
];

export default function GapScreen() {
  return (
    <JourneyShell step="gap">
      {({ state, invoice, result, update }) => {
        const gap = result.views.keepFull.gap;
        const { low, expected, high } = gap.scenarios;
        const cols = [
          ["Low sales", low],
          ["Expected", expected],
          ["High sales", high],
        ] as const;
        const cell = "px-3 py-2 text-right tabular-nums";
        return (
          <>
            <Card>
              <SectionTitle aside={<SimulatedTag />}>Your cash gap</SectionTitle>
              <p className="mt-1 text-sm text-muted">
                {invoice.supplier}: {formatINR(invoice.amount)} for {invoice.units} pairs, due in {invoice.dueInDays}{" "}
                days. This is the most you could be short on any single day until then.
              </p>

              <div className="mt-5">
                {gap.gapMax === 0 ? (
                  <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
                    No gap: in every sales scenario you expect to have enough cash on the due date.
                  </p>
                ) : (
                  <RangeBar best={gap.gapMin} expected={gap.gapExpected} worst={gap.gapMax} />
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <p className="text-sm">
                  Gap range: <strong>{formatINR(gap.gapMin)}</strong> to <strong>{formatINR(gap.gapMax)}</strong>
                </p>
                {gap.lowConfidence && <LowConfidenceBadge widthShare={gap.widthShare} />}
              </div>
              <p className="mt-2 text-xs text-muted">
                {state.salesDropPercent > 0
                  ? `Assuming sales are ${state.salesDropPercent}% lower than the forecast. Change this on the Options screen.`
                  : "No sales drop assumed. You can test a drop on the Options screen."}
              </p>
            </Card>

            <Card>
              <SectionTitle aside={<SimulatedTag />}>Where the cash comes from</SectionTitle>
              <p className="mt-1 text-sm text-muted">
                Cash expected by day {gap.byDay}, in each sales scenario. Sales, COD payouts and the bank balance
                are made up for {merchant.name}.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs text-muted">
                      <th className="px-3 py-2 text-left font-medium">Cash in</th>
                      {cols.map(([name, s]) => (
                        <th key={name} className="px-3 py-2 text-right font-medium">
                          {name} ({s.uplift}x)
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {ROWS.map((row) => (
                      <tr key={row.label}>
                        <td className="px-3 py-2">
                          {row.label} {row.tag && <SimulatedTag>{row.tag}</SimulatedTag>}
                        </td>
                        {cols.map(([name, s]) => (
                          <td key={name} className={cell}>
                            {formatINR(row.value(s))}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="px-3 py-2">Total cash in</td>
                      {cols.map(([name, s]) => (
                        <td key={name} className={cell}>
                          {formatINR(s.cash.totalIn)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-3 py-2">Invoice due</td>
                      {cols.map(([name, s]) => (
                        <td key={name} className={cell}>
                          {formatINR(s.invoiceDue)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-3 py-2">
                        Other money going out before then <SimulatedTag />
                      </td>
                      {cols.map(([name, s]) => (
                        <td key={name} className={cell}>
                          {formatINR(s.otherOutflows)}
                        </td>
                      ))}
                    </tr>
                    <tr className="font-semibold">
                      <td className="px-3 py-2">Total cash out</td>
                      {cols.map(([name, s]) => (
                        <td key={name} className={cell}>
                          {formatINR(s.cashOut)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-3 py-2">Shortfall on day {gap.byDay} alone (cash out − cash in)</td>
                      {cols.map(([name, s]) => (
                        <td key={name} className={cell}>
                          {s.gapOnPayDay > 0 ? formatINR(s.gapOnPayDay) : "None"}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-background font-semibold">
                      <td className="px-3 py-2">
                        Gap to cover: the largest shortfall on any day up to day {gap.windowEnd}
                      </td>
                      {cols.map(([name, s]) => (
                        <td key={name} className={`${cell} ${s.gap > 0 ? "text-red-700" : "text-green-700"}`}>
                          {s.gap > 0 ? formatINR(s.gap) : "None"}
                          {s.gap > 0 && <span className="block text-[11px] font-normal text-muted">on day {s.peak.day}</span>}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <SectionTitle>Tell us what you know</SectionTitle>
              <p className="mt-1 text-sm text-muted">Change either one and everything is worked out again.</p>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <NumberField
                  id="cash-elsewhere"
                  label="Cash available elsewhere"
                  prefix="₹"
                  value={state.cashElsewhere}
                  onCommit={(v) => update({ cashElsewhere: v })}
                  max={1_000_000_000}
                  hint="Another account or savings you could use. Reduces the gap rupee for rupee."
                />
                <NumberField
                  id="overdraft-rate"
                  label="Your bank's overdraft rate"
                  suffix="% a year"
                  value={state.overdraftRatePct}
                  onCommit={(v) => update({ overdraftRatePct: v })}
                  max={100}
                  hint={`Used to price your own overdraft (limit ${formatINR(merchant.overdraftLimit)}, simulated). Default ${CONFIG.overdraftRatePct}%.`}
                />
              </div>
            </Card>

            <div className="flex justify-end">
              <Link
                href="/options"
                className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
              >
                See your options →
              </Link>
            </div>
          </>
        );
      }}
    </JourneyShell>
  );
}
