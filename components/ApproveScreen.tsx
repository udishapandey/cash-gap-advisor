"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { EngineResult } from "@/lib/engine";
import { formatINR, formatLakh, inrShort } from "@/lib/format";
import { CREDIT_NEEDS_APPROVAL, backupLine, dayLabel, forecastSaving, tidyName } from "@/lib/plain";
import {
  approvalBlockers,
  approvalStage,
  buildKfs,
  canApprove,
  consentText,
  earlyPayDay,
  SOURCE_TAGS,
  SIMULATED_ACCOUNT,
  splitPlan,
  supplierPayment,
  tenureDays,
} from "@/lib/journey";
import type { ShellContext } from "./JourneyShell";
import JourneyShell from "./JourneyShell";
import KeyFactStatementPanel from "./KeyFactStatement";
import { Alert, BTN, Badge, Card, KeyValues, Metric, PageHeader, Panel, SectionLabel, SourceRow, Tile } from "./ui";

export default function ApproveScreen() {
  return <JourneyShell step="approve">{(ctx) => <ApproveBody {...ctx} />}</JourneyShell>;
}

function ApproveBody({ state, result, update }: ShellContext) {
  const view = state.chosenView === "right_sized" ? result.views.rightSized : result.views.keepFull;
  const plan = view.recommended.plan;
  const sections = splitPlan(view, result.stock.fullUnits);
  const blockers = approvalBlockers(view);
  const stage = approvalStage(state);
  const pay = supplierPayment(view);
  const backup = backupLine(view);
  const kfs = sections.creditLine ? buildKfs(sections.creditLine.amount, tenureDays(view), sections.creditLine.cost) : null;
  const date = (day: number) => dayLabel(view.invoice, day);
  const supplier = tidyName(view.invoice.supplier);

  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<null | "touch" | "pay">(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const allowed = canApprove({ view, sections, consent });
  const early = view.recommended.timing === "pay_early_for_discount";
  const payDay = early ? earlyPayDay(view.invoice) : view.invoice.dueInDays;
  const savingNow = forecastSaving(result, state.chosenView ?? "keep_full", state);

  // Both buttons are simulations: a short pause, then the next stage.
  function approve() {
    setBusy("touch");
    timer.current = setTimeout(() => {
      update({ approved: true });
      setBusy(null);
    }, 1200);
  }
  function payNow() {
    setBusy("pay");
    timer.current = setTimeout(() => {
      update({ paid: true });
      setBusy(null);
    }, 1000);
  }

  if (stage === "done") return <Success view={view} pay={pay} result={result} saving={savingNow} />;

  const approved = stage !== "review";
  const funding = [
    ...(sections.nonCredit.some((x) => x.id === "own_cash")
      ? [{ id: "own_cash", label: "Cash", amount: plan.ownCash, by: null as string | null, group: "Your money" }]
      : []),
    ...(sections.overdraft
      ? [{ id: "od", label: "Bank overdraft", amount: sections.overdraft.amount, by: sections.overdraft.closedDay === null ? null : date(sections.overdraft.closedDay), group: "Borrowed" }]
      : []),
    ...(sections.creditLine
      ? [{ id: "cl", label: "Razorpay credit", amount: sections.creditLine.amount, by: sections.creditLine.closedDay === null ? null : date(sections.creditLine.closedDay), group: "Borrowed" }]
      : []),
  ];

  const repayments = [sections.overdraft, sections.creditLine]
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => (a.closedDay ?? 1e9) - (b.closedDay ?? 1e9));

  return (
    <>
      <PageHeader title={`You're about to pay ${supplier}`} crumbs={["Supplier bills", "Approve"]} />

      <Panel aria-label="Plan summary">
        <div className="flex flex-wrap items-start justify-between gap-4 p-6">
          <Metric
            size="lg"
            label="Supplier payment"
            value={`${formatLakh(pay)} on ${date(payDay)}`}
            caption={`${formatINR(pay)} in full${early ? `, ${formatINR(view.discount.discountAmount)} off` : ""}`}
          />
          <Link href="/options" className={BTN.link}>
            Change plan
          </Link>
        </div>
        <div className="grid gap-4 border-t border-line px-6 py-5 md:grid-cols-3">
          <Tile label="Payment sources">
            <ul className="divide-y divide-line">
              {funding.map((f) => (
                <SourceRow
                  key={f.id}
                  id={f.id === "od" ? "bank_overdraft" : f.id === "cl" ? "credit_line" : "own_cash"}
                  label={f.label}
                  amount={inrShort(f.amount)}
                  note={f.id === "od" ? SOURCE_TAGS.bank_overdraft.label : f.id === "cl" ? SOURCE_TAGS.credit_line.label : undefined}
                />
              ))}
            </ul>
          </Tile>
          <Tile label="Cost">
            <p className="text-xs text-muted">Estimated financing cost</p>
            <p className="mt-1 font-heading text-3xl font-semibold tabular-nums">{formatINR(plan.totalCost)}</p>
          </Tile>
          <Tile label="Repayment">
            {repayments.length === 0 ? (
              <p className="text-sm text-muted">Nothing to repay</p>
            ) : (
              <ul className="divide-y divide-line">
                {repayments.map((r) => (
                  <li key={r.optionId} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="text-sm">{r.optionId === "bank_overdraft" ? "Bank overdraft" : "Razorpay credit"}</span>
                    <span className="rounded-md bg-card px-2 py-0.5 text-base font-semibold tabular-nums ring-1 ring-line">
                      {r.closedDay === null ? "When cash allows" : date(r.closedDay)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Tile>
        </div>
        {backup && <p className={`border-t border-line px-6 py-3 text-xs ${backup.warn ? "text-red-700" : "text-muted"}`}>{backup.text}</p>}
      </Panel>

      <Card aria-label="Financing approval">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel>{kfs ? "Financing approval" : "Approval"}</SectionLabel>
          {approved && <Badge tone="positive">Approved</Badge>}
        </div>

        {approved ? (
          <ul className="mt-3 space-y-1.5 text-sm">
            {kfs && sections.creditLine && (
              <li>
                {formatINR(kfs.loanAmount)} credited to account {SIMULATED_ACCOUNT} by {kfs.lender}. Not paid to the supplier.
              </li>
            )}
            {sections.overdraft && <li>Draw {formatINR(sections.overdraft.amount)} from your overdraft at your bank.</li>}
            <li className="text-xs text-muted">Touch ID approval is simulated.</li>
          </ul>
        ) : (
          <>
            {blockers.map((b) => (
              <div key={b} className="mt-3">
                <Alert tone="negative">{b}</Alert>
              </div>
            ))}
            {kfs && sections.creditLine ? (
              <div className="mt-3 space-y-4">
                <KeyValues
                  rows={[
                    { label: "Lender", value: kfs.lender },
                    { label: "Amount", value: formatINR(kfs.loanAmount) },
                    { label: "Interest rate", value: `${kfs.annualRatePct}% a year` },
                    { label: "Total repayable", value: formatINR(kfs.totalRepayable), strong: true },
                  ]}
                />
                <details className="group rounded-md border border-line">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-medium marker:content-none">
                    Key Fact Statement
                    <span className="text-brand-text group-open:hidden">View full statement</span>
                    <span className="hidden text-brand-text group-open:inline">Hide</span>
                  </summary>
                  <div className="border-t border-line p-3">
                    <KeyFactStatementPanel kfs={kfs} />
                  </div>
                </details>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#3395ff]" />
                  <span>{consentText(kfs)}</span>
                </label>
                <p className="text-xs text-muted">{CREDIT_NEEDS_APPROVAL}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">{sections.overdraft ? "Draw the overdraft at your bank. It is not part of this approval." : "Nothing is borrowed."}</p>
            )}
            <div className="mt-4">
              <button type="button" onClick={approve} disabled={!allowed || busy !== null} className={BTN.primary}>
                {busy === "touch" ? "Verifying…" : `Approve ${formatLakh(pay)} payment`}
              </button>
              <p className="mt-2 text-xs text-muted">Touch ID is simulated. Nothing is approved automatically.</p>
            </div>
          </>
        )}
      </Card>

      <Card aria-label="Pay supplier">
        <SectionLabel>Pay supplier</SectionLabel>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <Metric label={supplier} value={formatINR(pay)} caption={early ? `Pay by ${date(payDay)} for the discount · bill due ${date(view.invoice.dueInDays)}` : `Due ${date(payDay)}`} />
          <button type="button" onClick={payNow} disabled={!approved || busy !== null} className={BTN.primary}>
            {busy === "pay" ? "Paying…" : "Pay supplier"}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">{approved ? "Simulated. No real money moves." : kfs ? "Approve financing first." : "Approve the payment first."}</p>
      </Card>
    </>
  );
}

function Success({ view, pay, result, saving }: { view: EngineResult["views"]["keepFull"]; pay: number; result: EngineResult; saving: number }) {
  void result;
  const plan = view.recommended.plan;
  const early = view.recommended.timing === "pay_early_for_discount";
  return (
    <Panel className="mx-auto max-w-xl text-center" aria-label="Supplier paid">
      <div className="p-8">
        <div aria-hidden className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-xl text-green-700">
          ✓
        </div>
        <h1 className="mt-3 font-heading text-xl font-semibold">Supplier paid</h1>
        <p className="mt-1 font-heading text-3xl font-semibold tabular-nums">{formatINR(pay)}</p>
        <p className="mt-1 text-xs text-muted">Simulated. No real money moved.</p>
        <div className="mx-auto mt-5 max-w-sm text-left">
          <KeyValues
            rows={[
              ...(early ? [{ label: "Discount captured", value: formatINR(view.discount.discountAmount) }] : []),
              { label: "Financing cost", value: formatINR(plan.totalCost) },
              { label: "Net benefit", value: formatINR(Math.max(0, saving)), strong: true },
            ]}
          />
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
          <Link href="/results" className={BTN.primary}>
            See results
          </Link>
          <Link href="/" className={BTN.link}>
            Back to home
          </Link>
        </div>
      </div>
    </Panel>
  );
}
