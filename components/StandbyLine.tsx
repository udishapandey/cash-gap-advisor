import { standbyFor } from "@/lib/engine/standby";
import type { ViewResult } from "@/lib/engine";
import { formatCompactINR, formatINR } from "@/lib/format";
import { TERMS } from "@/lib/plain";

/**
 * "Backup if sales are slow" (the engine calls it standby): the extra cash that could be needed if sales come in low, and
 * whether your unused Razorpay credit limit covers it. Not part of the plan and never drawn automatically: it costs
 * nothing unless the founder chooses to use it. `compact` is the two-short-sentence version for the Options headline card.
 */
export default function StandbyLine({ view, compact = false }: { view: ViewResult; compact?: boolean }) {
  const sb = standbyFor(view);
  return (
    <div aria-label={TERMS.standby} className="mt-3 rounded-md border border-line bg-background px-3 py-2 text-xs">
      <p>
        <strong>{TERMS.standby}:</strong>{" "}
        {sb.amount === 0 ? (
          <>none needed. The plan already covers even low sales.</>
        ) : compact ? (
          <>
            up to {formatCompactINR(sb.amount)} more may be needed around day {sb.day}.{" "}
            {sb.coveredByHeadroom ? "Your unused credit limit covers it" : `Your unused credit limit covers ${formatCompactINR(sb.headroom)}`}, at{" "}
            <strong>₹0 cost unless you use it</strong>.
          </>
        ) : (
          <>
            up to <strong>{formatINR(sb.amount)}</strong> more could be needed around day {sb.day} if sales come in low.
            {sb.coveredByHeadroom ? (
              <> Your unused Razorpay credit limit ({formatINR(sb.headroom)}) covers it.</>
            ) : (
              <> Your unused Razorpay credit limit is {formatINR(sb.headroom)}.</>
            )}{" "}
            <strong>₹0 cost unless used</strong>
            {sb.costIfDrawn > 0 && (
              <> (about {formatINR(sb.costIfDrawn)} {sb.coveredByHeadroom ? "if used in full" : "for the part the limit covers"})</>
            )}. Never used automatically: you decide.
          </>
        )}
      </p>
      {!sb.coveredByHeadroom && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-red-700">
          Warning: your unused credit limit is {formatINR(sb.shortBy)} short of this backup. If sales are slow you would need
          another source, such as extra cash or your bank&apos;s overdraft.
        </p>
      )}
    </div>
  );
}
