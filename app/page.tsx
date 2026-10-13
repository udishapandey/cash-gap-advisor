"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BTN, Badge, Metric, PageHeader, Panel } from "@/components/ui";
import { useJourney } from "@/components/JourneyProvider";
import { defaultInvoice } from "@/lib/data/default-scenario";
import { merchant } from "@/lib/data/merchant";
import { runEngine } from "@/lib/engine";
import { inrShort } from "@/lib/format";
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
    <div className="space-y-6">
      <PageHeader title="Supplier bills" crumbs={["Vendor Payments"]} />

      <Panel aria-label="Opportunity">
        <div className="flex flex-wrap items-start justify-between gap-6 p-6">
          <div>
            <Badge tone="positive">Opportunity</Badge>
            <h2 className="mt-3 font-heading text-3xl font-semibold">{alert.title}</h2>
            <p className="mt-1 text-sm text-subtle">{alert.line}</p>
          </div>
          {alert.saving > 0 && <Metric size="lg" tone="saved" label="Net benefit" value={alert.caption} />}
        </div>

        <div className="grid gap-6 border-t border-line px-6 py-4 sm:grid-cols-3">
          {alert.facts.map((f) => (
            <Metric key={f.label} label={f.label} value={f.value} caption={f.caption} />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-6 py-4">
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-subtle" aria-label="Funding">
            {alert.mini.map((m) => (
              <span key={m.label}>
                {m.label} <span className="font-medium text-foreground tabular-nums">{inrShort(m.value)}</span>
              </span>
            ))}
          </p>
          <Link href="/invoice" className={BTN.primary}>
            Review plan
          </Link>
        </div>
      </Panel>
    </div>
  );
}
