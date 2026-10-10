import HelloPanel from "@/components/HelloPanel";
import { merchant, SIMULATED_LABEL } from "@/lib/data/merchant";
import { sampleInvoice } from "@/lib/data/invoice";
import { runEngine } from "@/lib/engine";
import { formatINR } from "@/lib/format";

function SimulatedTag() {
  return <p className="mt-2 text-xs text-amber-700">{SIMULATED_LABEL}</p>;
}

export default function Home() {
  const { gap } = runEngine({ merchant, invoice: sampleInvoice });
  const { low, expected, high } = gap.scenarios;

  const cashIn = [
    ["Bank balance today", expected.cash.bankBalance],
    ["Prepaid sales already in transit", expected.cash.settlementsInTransit],
    ["Forecast prepaid sales settling in time", expected.cash.forecastPrepaid],
    ["COD payouts arriving in time, after returns", expected.cash.codPayouts],
  ] as const;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{merchant.name}</h2>
        <p className="text-sm text-muted">
          Supplier invoice of {formatINR(sampleInvoice.amount)} due in {gap.byDay} days
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Cash in by due date</p>
          <p className="mt-2 text-2xl font-semibold">{formatINR(expected.cash.totalIn)}</p>
          <p className="mt-1 text-xs text-muted">
            Range {formatINR(low.cash.totalIn)} to {formatINR(high.cash.totalIn)}
          </p>
          <SimulatedTag />
        </div>

        <div className="rounded-xl border border-line bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Cash out by due date</p>
          <p className="mt-2 text-2xl font-semibold">{formatINR(expected.cashOut)}</p>
          <p className="mt-1 text-xs text-muted">
            Invoice {formatINR(expected.invoiceDue)} + other outflows {formatINR(expected.otherOutflows)}
          </p>
          <SimulatedTag />
        </div>

        <div className="rounded-xl border border-line bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Projected cash gap</p>
          <p className="mt-2 text-2xl font-semibold">
            {formatINR(gap.gapMin)} to {formatINR(gap.gapMax)}
          </p>
          <p className="mt-1 text-xs text-muted">Expected {formatINR(gap.gapExpected)}</p>
          {gap.lowConfidence && (
            <p className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Low confidence: wide forecast range
            </p>
          )}
          <SimulatedTag />
        </div>
      </section>

      <section className="rounded-xl border border-line bg-card p-5">
        <p className="text-xs uppercase tracking-wide text-muted">How expected cash in adds up</p>
        <dl className="mt-3 divide-y divide-line text-sm">
          {cashIn.map(([label, value]) => (
            <div key={label} className="flex justify-between py-2">
              <dt>{label}</dt>
              <dd className="font-medium tabular-nums">{formatINR(value)}</dd>
            </div>
          ))}
          <div className="flex justify-between py-2 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatINR(expected.cash.totalIn)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-amber-700">{SIMULATED_LABEL}: sales, COD and balance are made up.</p>
      </section>

      <HelloPanel />
    </div>
  );
}
