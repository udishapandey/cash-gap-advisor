"use client";

import Link from "next/link";
import { useMemo } from "react";
import { StatCard } from "@/components/ui";
import { useJourney } from "@/components/JourneyProvider";
import { defaultInvoice } from "@/lib/data/default-scenario";
import { merchant } from "@/lib/data/merchant";
import { runEngine } from "@/lib/engine";
import { formatINR } from "@/lib/format";
import { dayLabel, tidyName } from "@/lib/plain";

/** Home: the upcoming supplier bill and how short you could be. The bill is the one the founder confirmed, or the demo bill. */
export default function Home() {
  const { state } = useJourney();
  const invoice = state.invoice ?? defaultInvoice;
  const mine = state.invoice !== null;
  const { views } = useMemo(
    () =>
      runEngine({
        merchant,
        invoice,
        salesDropPercent: mine ? state.salesDropPercent : 0,
        cashElsewhere: mine ? state.cashElsewhere : 0,
        overdraftRatePct: mine ? state.overdraftRatePct : undefined,
      }),
    [invoice, mine, state.salesDropPercent, state.cashElsewhere, state.overdraftRatePct],
  );
  const gap = views.keepFull.gap;
  const expected = gap.scenarios.expected;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-baseline gap-3">
        <h1 className="font-heading text-2xl font-semibold">Overview</h1>
        <span className="text-sm font-medium text-brand-text">Next {invoice.dueInDays} days</span>
      </div>

      <StatCard
        big
        label="Upcoming supplier bill"
        value={formatINR(invoice.amount)}
        caption={`${tidyName(invoice.supplier)} · due ${dayLabel(invoice, invoice.dueInDays)}`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Cash coming in" value={formatINR(expected.cash.totalIn)} />
        <StatCard label="Cash going out" value={formatINR(expected.cashOut)} />
        <StatCard label="Likely short" value={formatINR(gap.gapExpected)} tone="short" />
      </div>

      <Link
        href="/invoice"
        className="inline-block rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
      >
        Plan this payment
      </Link>
    </div>
  );
}
