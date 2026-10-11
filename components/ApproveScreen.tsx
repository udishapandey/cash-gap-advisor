"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { EngineResult } from "@/lib/engine";
import { formatINR, formatPct } from "@/lib/format";
import {
  approvalBlockers,
  approvalStage,
  buildKfs,
  canApprove,
  consentText,
  earlyPayDay,
  needsCreditConsent,
  overdraftFirstNote,
  SOURCE_TAGS,
  SIMULATED_ACCOUNT,
  splitPlan,
  supplierPayment,
  tenureDays,
} from "@/lib/journey";
import type { ShellContext } from "./JourneyShell";
import JourneyShell from "./JourneyShell";
import KeyFactStatementPanel from "./KeyFactStatement";
import StandbyLine from "./StandbyLine";
import { Card, SectionTitle, SimulatedTag } from "./ui";

export default function ApproveScreen() {
  return <JourneyShell step="approve">{(ctx) => <ApproveBody {...ctx} />}</JourneyShell>;
}

function ApproveBody({ state, result, update, reset }: ShellContext) {
  const router = useRouter();
  const view = state.chosenView === "right_sized" ? result.views.rightSized : result.views.keepFull;
  const planName = state.chosenView === "right_sized" ? "Right-size order" : "Keep full order";
  const plan = view.recommended.plan;
  const sections = splitPlan(view, result.stock.fullUnits);
  const blockers = approvalBlockers(view);
  const stage = approvalStage(state);
  const pay = supplierPayment(view);
  const kfs = sections.creditLine ? buildKfs(sections.creditLine.amount, tenureDays(view)) : null;
  const overdraftNote = overdraftFirstNote({
    options: view.recommended.timing === "pay_early_for_discount" ? view.earlyOptions : view.options,
    steps: plan.steps,
    loanDays: tenureDays(view),
  });

  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<null | "touch" | "pay">(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const allowed = canApprove({ view, sections, consent });
  const early = view.recommended.timing === "pay_early_for_discount";
  const payWhen = early ? `by day ${earlyPayDay(view.invoice)}` : `on the due date (day ${view.invoice.dueInDays})`;

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
  function startAgain() {
    reset();
    router.push("/invoice");
  }

  if (stage === "done") return <Success view={view} pay={pay} result={result} onAgain={startAgain} />;

  if (stage === "pay") {
    return (
      <>
        <Card className="border-green-300">
          <SectionTitle aside={<SimulatedTag />}>Approved ✓</SectionTitle>
          <p className="mt-1 text-sm text-muted">Approved with Touch ID (simulated: no fingerprint was read).</p>
          <ul className="mt-4 space-y-2 text-sm">
            {kfs && sections.creditLine && (
              <li>
                <strong>{formatINR(kfs.loanAmount)}</strong> has been paid into your own bank account{" "}
                {SIMULATED_ACCOUNT} by {kfs.lender}. It did not go to the supplier.
              </li>
            )}
            {sections.overdraft && (
              <li>
                Draw <strong>{formatINR(sections.overdraft.amount)}</strong> from your own bank overdraft yourself. We
                can&apos;t do this for you.
              </li>
            )}
            {sections.nonCredit.map((a) => (
              <li key={a.id}>{a.text}.</li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionTitle>Step: pay the supplier</SectionTitle>
          <p className="mt-1 text-sm text-muted">
            Any loan goes to your own account first. Paying {view.invoice.supplier} is a separate step, and you confirm
            it yourself.
          </p>
          <button
            type="button"
            onClick={payNow}
            disabled={busy !== null}
            className="mt-4 rounded-md bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
          >
            {busy === "pay" ? "Paying… (simulated)" : `Pay supplier ${formatINR(pay)}`}
          </button>
          <p className="mt-2 text-xs text-muted">
            <SimulatedTag /> No real money moves. Due {payWhen}.
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <Card>
        <SectionTitle aside={<SimulatedTag />}>Review and approve</SectionTitle>
        <p className="mt-1 text-sm text-muted">
          You chose <strong>{planName}</strong>. Nothing happens until you approve at the bottom.
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Pay the supplier</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatINR(pay)}</dd>
            <dd className="text-xs text-muted">{payWhen}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Order</dt>
            <dd className="text-lg font-semibold tabular-nums">{view.units} pairs</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Loan total</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatINR(view.loan)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Total funding cost</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatINR(plan.totalCost)}</dd>
          </div>
        </dl>
        <StandbyLine view={view} />
        <Link href="/options" className="mt-3 inline-block text-sm text-brand hover:underline">
          ← Change plan
        </Link>
      </Card>

      <Card className="border-l-4 border-l-green-500">
        <SectionTitle>Actions that are not credit</SectionTitle>
        <p className="mt-1 text-sm text-muted">These are not loans. No borrowing is involved.</p>
        {sections.nonCredit.length === 0 ? (
          <p className="mt-3 text-sm">None. Besides paying the supplier, nothing else is needed.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {sections.nonCredit.map((a) => (
              <li key={a.id} className="py-2">
                <p className="font-medium">{a.text}</p>
                {a.detail && <p className="text-xs text-muted">{a.detail}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="border-l-4 border-l-red-500" aria-label="Credit">
        <SectionTitle aside={<span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">Credit: needs your consent</span>}>
          Credit
        </SectionTitle>
        <p className="mt-1 text-sm text-muted">
          Borrowed money must be repaid with interest. It is kept apart from the actions above on purpose.
        </p>

        {!sections.creditLine && !sections.overdraft && (
          <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            No credit is needed for this plan.
          </p>
        )}

        {sections.overdraft && (
          <div className="mt-4 rounded-lg border border-line p-4">
            <h3 className="text-sm font-semibold">
              Your own bank overdraft: {formatINR(sections.overdraft.amount)}{" "}
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">
                {SOURCE_TAGS.bank_overdraft.label}
              </span>
            </h3>
            <p className="mt-1 text-sm">
              At {formatPct(state.overdraftRatePct)} a year the cost is about {formatINR(sections.overdraft.cost)}.
              You draw this yourself at your own bank. It is not part of this approval, and we never draw it for you.
            </p>
            {overdraftNote && <p className="mt-2 text-xs text-green-900">{overdraftNote}</p>}
          </div>
        )}

        {kfs && sections.creditLine && (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">
                Credit line from {kfs.lender}{" "}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                  {SOURCE_TAGS.credit_line.label}
                </span>
              </h3>
              <p className="mt-1 text-sm">
                Borrow <strong>{formatINR(kfs.loanAmount)}</strong> at {kfs.annualRatePct}% a year for {kfs.tenureDays}{" "}
                days. Total interest {formatINR(kfs.totalInterest)}. You repay{" "}
                <strong>{formatINR(kfs.totalRepayable)}</strong>.
              </p>
            </div>
            <KeyFactStatementPanel kfs={kfs} />
            <label className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-[#3395ff]"
              />
              <span>{consentText(kfs)}</span>
            </label>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle aside={<SimulatedTag />}>Approve</SectionTitle>
        {blockers.map((b) => (
          <p key={b} role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {b}
          </p>
        ))}
        {needsCreditConsent(sections) && !consent && blockers.length === 0 && (
          <p className="mt-3 text-sm text-muted">Read the Key Fact Statement and tick the consent box to approve.</p>
        )}
        <button
          type="button"
          onClick={approve}
          disabled={!allowed || busy !== null}
          className="mt-4 rounded-md bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "touch" ? "Verifying… (simulated)" : "Approve with Touch ID"}
        </button>
        <p className="mt-2 text-xs text-muted">
          Simulated: no real fingerprint is read and no real credit is drawn. Nothing is approved automatically.
        </p>
      </Card>
    </>
  );
}

function Success({
  view,
  pay,
  result,
  onAgain,
}: {
  view: EngineResult["views"]["keepFull"];
  pay: number;
  result: EngineResult;
  onAgain: () => void;
}) {
  const sections = splitPlan(view, result.stock.fullUnits);
  const kfs = sections.creditLine ? buildKfs(sections.creditLine.amount, tenureDays(view)) : null;
  const plan = view.recommended.plan;
  return (
    <Card className="border-green-300 text-center">
      <div
        aria-hidden
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700"
      >
        ✓
      </div>
      <h2 className="mt-3 text-xl font-semibold">Supplier paid</h2>
      <p className="mt-1 text-sm text-muted">
        <SimulatedTag /> Nothing real happened: this is a concept prototype.
      </p>
      <dl className="mx-auto mt-5 max-w-md divide-y divide-line text-left text-sm">
        <div className="flex justify-between py-2">
          <dt className="text-muted">Paid to {view.invoice.supplier}</dt>
          <dd className="font-semibold tabular-nums">{formatINR(pay)}</dd>
        </div>
        <div className="flex justify-between py-2">
          <dt className="text-muted">Order</dt>
          <dd className="tabular-nums">{view.units} pairs</dd>
        </div>
        <div className="flex justify-between py-2">
          <dt className="text-muted">Loans taken</dt>
          <dd className="tabular-nums">{formatINR(view.loan)}</dd>
        </div>
        <div className="flex justify-between py-2">
          <dt className="text-muted">Total funding cost</dt>
          <dd className="tabular-nums">{formatINR(plan.totalCost)}</dd>
        </div>
        {kfs && (
          <div className="flex justify-between py-2">
            <dt className="text-muted">Repay {kfs.lender}</dt>
            <dd className="tabular-nums">
              {formatINR(kfs.totalRepayable)} in {kfs.tenureDays} days
            </dd>
          </div>
        )}
      </dl>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/results" className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover">
          See how the plan did →
        </Link>
        <button
          type="button"
          onClick={onAgain}
          className="rounded-md border border-brand-border text-brand-text px-5 py-2.5 text-sm font-medium hover:bg-background"
        >
          Start another invoice
        </button>
        <Link href="/" className="rounded-md border border-brand-border text-brand-text px-5 py-2.5 text-sm font-medium hover:bg-background">
          Back to the dashboard
        </Link>
      </div>
    </Card>
  );
}
