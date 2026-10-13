"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Card } from "@/components/ui";
import { useJourney } from "@/components/JourneyProvider";
import { defaultInvoice } from "@/lib/data/default-scenario";
import { merchant } from "@/lib/data/merchant";
import { runEngine } from "@/lib/engine";
import { formatINR } from "@/lib/format";
import { forecastSaving, homeAlert } from "@/lib/plain";

/**
 * Home, inside "Supplier bills" (part of RazorpayX Vendor Payments): one alert for the upcoming bill and a three-line
 * mini plan. The bill is the one the founder confirmed, or the demo bill.
 */
export default function Home() {
  const { state } = useJourney();
  const invoice = state.invoice ?? defaultInvoice;
  const mine = state.invoice !== null;
  const salesDropPercent = mine ? state.salesDropPercent : 0;
  const cashElsewhere = mine ? state.cashElsewhere : 0;
  const alert = useMemo(() => {
    const result = runEngine({
      merchant,
      invoice,
      salesDropPercent,
      cashElsewhere,
      overdraftRatePct: mine ? state.overdraftRatePct : undefined,
    });
    return homeAlert(result, forecastSaving(result, result.recommendedView, { salesDropPercent, cashElsewhere }));
  }, [invoice, mine, salesDropPercent, cashElsewhere, state.overdraftRatePct]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Supplier bills</h1>
        <p className="mt-1 text-sm text-muted">Part of Vendor Payments</p>
      </div>

      <Card aria-label="Supplier bill alert" className="p-6">
        <h2 className="font-heading text-xl font-semibold">{alert.title}</h2>
        <p className="mt-1 text-sm text-subtle">{alert.line}</p>

        <p className="mt-5 flex flex-wrap gap-x-2 gap-y-1 text-sm" aria-label="Mini plan">
          {alert.mini.map((m, i) => (
            <span key={m.label}>
              {i > 0 && <span className="mr-2 text-muted">·</span>}
              {m.label} <span className="font-semibold tabular-nums">{formatINR(m.value)}</span>
            </span>
          ))}
        </p>
        {alert.saving > 0 && <p className="mt-3 font-heading text-2xl font-semibold text-green-700">{alert.caption}</p>}

        <Link
          href="/invoice"
          className="mt-5 inline-block rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
        >
          Review plan
        </Link>
      </Card>
    </div>
  );
}
