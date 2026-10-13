"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BTN, Badge, Metric, PageHeader, Panel, SOURCE_COLOUR, SectionLabel } from "@/components/ui";
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

        <div className="border-t border-line px-6 py-5">
          <SectionLabel>Funding plan</SectionLabel>
          <ul className="mt-3 grid gap-3 sm:grid-cols-3" aria-label="Funding">
            {alert.mini.map((m) => (
              <li key={m.id} className="rounded-lg border border-line bg-background px-4 py-3">
                <p className="flex items-center gap-2 text-xs text-muted">
                  <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${SOURCE_COLOUR[m.id]}`} />
                  {m.label}
                </p>
                <p className="mt-1 font-heading text-xl font-semibold tabular-nums">{inrShort(m.value)}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end border-t border-line px-6 py-4">
          <Link href="/invoice" className={BTN.primary}>
            Review plan
          </Link>
        </div>
      </Panel>
    </div>
  );
}
