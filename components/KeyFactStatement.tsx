import { formatINR } from "@/lib/format";
import { KFS_DISCLAIMER, KFS_LABEL, type KeyFactStatement } from "@/lib/journey";
import { SimulatedTag } from "./ui";

/** The facts a borrower must see before any credit is drawn. Every number comes from `buildKfs`. */
export default function KeyFactStatementPanel({ kfs }: { kfs: KeyFactStatement }) {
  const rows: [string, React.ReactNode][] = [
    ["Lender", kfs.lender],
    ["Loan amount", formatINR(kfs.loanAmount)],
    ["Interest rate", `${kfs.annualRatePct}% a year`],
    ["APR, including fees", `${kfs.apr}% a year`],
    ["Total interest", formatINR(kfs.totalInterest)],
    ["Fees", kfs.fees === 0 ? "₹0 (none in this simulation)" : formatINR(kfs.fees)],
    ["Tenure", `${kfs.tenureDays} days`],
    ["Total repayable", <strong key="t">{formatINR(kfs.totalRepayable)}</strong>],
    ["Cooling-off period", `${kfs.coolingOffDays} days. Cancel by repaying principal and interest to date.`],
    ["Disbursed to", kfs.disbursedTo],
    [
      "Grievance contact",
      <>
        {kfs.grievance.officer}
        <br />
        {kfs.grievance.email} · {kfs.grievance.phone}
      </>,
    ],
  ];
  return (
    <div aria-label="Key Fact Statement" className="rounded-lg border border-slate-300 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold uppercase tracking-wide">Key Fact Statement</h4>
        <SimulatedTag>{KFS_LABEL}</SimulatedTag>
      </div>
      <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{KFS_DISCLAIMER}</p>
      <dl className="mt-3 divide-y divide-slate-200 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 py-2 sm:grid-cols-[14rem_1fr]">
            <dt className="text-muted">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <h5 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Repayment schedule</h5>
      <table className="mt-1 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-muted">
            <th className="py-1 text-left font-medium">When</th>
            <th className="py-1 text-right font-medium">Principal</th>
            <th className="py-1 text-right font-medium">Interest</th>
            <th className="py-1 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {kfs.schedule.map((r) => (
            <tr key={r.dayAfterDisbursement}>
              <td className="py-1">{r.dayAfterDisbursement} days after the money reaches you</td>
              <td className="py-1 text-right tabular-nums">{formatINR(r.principal)}</td>
              <td className="py-1 text-right tabular-nums">{formatINR(r.interest)}</td>
              <td className="py-1 text-right font-semibold tabular-nums">{formatINR(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
