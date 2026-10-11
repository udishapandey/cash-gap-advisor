import Link from "next/link";
import Disclosure from "@/components/Disclosure";
import { merchant } from "@/lib/data/merchant";
import { sampleInvoice } from "@/lib/data/invoice";
import { runEngine } from "@/lib/engine";
import { formatCompactINR, formatDayMonth, formatINR } from "@/lib/format";

export default function Home() {
  const { gap } = runEngine({ merchant, invoice: sampleInvoice }).views.keepFull;
  const { low, expected, high } = gap.scenarios;

  const cashIn = [
    ["Bank balance today", expected.cash.bankBalance],
    ["Prepaid sales already in transit", expected.cash.settlementsInTransit],
    ["Forecast prepaid sales settling in time", expected.cash.forecastPrepaid],
    ["COD payouts arriving in time, after returns", expected.cash.codPayouts],
  ] as const;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h2 className="text-lg font-semibold">{merchant.name}</h2>

      <section aria-label="Your supplier bill" className="rounded-xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-800">Supplier bill due soon</p>
        <p className="mt-2 font-heading text-2xl font-semibold leading-snug">
          {sampleInvoice.supplier} bill of {formatINR(sampleInvoice.amount)} due {formatDayMonth(merchant.today, sampleInvoice.dueInDays)}.
        </p>
        <p className="mt-2 text-lg">
          You may be short about <strong>{formatCompactINR(expected.gap)}</strong>{" "}
          <span className="text-muted">
            (could be {formatCompactINR(low.gap > high.gap ? high.gap : low.gap)}–{formatCompactINR(Math.max(low.gap, high.gap))})
          </span>
          .
        </p>
        <Link
          href="/invoice"
          className="mt-4 inline-block rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
        >
          Plan how to pay it →
        </Link>
      </section>

      <Disclosure title="See how we worked this out">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-line p-4">
            <p className="text-xs text-muted">Cash in by due date</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{formatINR(expected.cash.totalIn)}</p>
            <p className="mt-1 text-xs text-muted">
              Range {formatINR(low.cash.totalIn)} to {formatINR(high.cash.totalIn)}
            </p>
          </div>
          <div className="rounded-lg border border-line p-4">
            <p className="text-xs text-muted">Cash out by due date</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{formatINR(expected.cashOut)}</p>
            <p className="mt-1 text-xs text-muted">
              Invoice {formatINR(expected.invoiceDue)} + other costs {formatINR(expected.otherOutflows)}
            </p>
          </div>
          <div className="rounded-lg border border-line p-4">
            <p className="text-xs text-muted">Expected shortfall</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatINR(gap.gapMin)} to {formatINR(gap.gapMax)}
            </p>
            <p className="mt-1 text-xs text-muted">Most likely {formatINR(gap.gapExpected)}</p>
            {gap.lowConfidence && (
              <p className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Low confidence: wide forecast range
              </p>
            )}
          </div>
        </div>

        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">How expected cash in adds up</p>
        <dl className="mt-2 divide-y divide-line text-sm">
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
      </Disclosure>
    </div>
  );
}
