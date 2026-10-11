import { standbyFor } from "@/lib/engine/standby";
import type { ViewResult } from "@/lib/engine";
import { formatINR } from "@/lib/format";

/**
 * Standby: the extra cash that could be needed if sales come in low, and whether unused credit-line headroom covers it.
 * Not part of the plan and never drawn automatically: it costs nothing unless the founder chooses to draw it.
 */
export default function StandbyLine({ view }: { view: ViewResult }) {
  const sb = standbyFor(view);
  return (
    <div aria-label="Standby" className="mt-3 rounded-md border border-line bg-background px-3 py-2 text-xs">
      <p>
        <strong>Standby:</strong>{" "}
        {sb.amount === 0 ? (
          <>none needed. The plan already covers even low sales.</>
        ) : (
          <>
            up to <strong>{formatINR(sb.amount)}</strong> more could be needed around day {sb.day} if sales come in low.
            {sb.coveredByHeadroom ? (
              <> Your unused credit-line headroom ({formatINR(sb.headroom)}) covers it.</>
            ) : (
              <> Your unused credit-line headroom is {formatINR(sb.headroom)}.</>
            )}{" "}
            <strong>₹0 cost unless drawn</strong>
            {sb.costIfDrawn > 0 && (
              <> (about {formatINR(sb.costIfDrawn)} {sb.coveredByHeadroom ? "if drawn in full" : "for the part the headroom covers"})</>
            )}. Never drawn automatically: you decide.
          </>
        )}
      </p>
      {!sb.coveredByHeadroom && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-red-700">
          Warning: unused credit-line headroom is {formatINR(sb.shortBy)} short of this standby. If sales come in low you
          would need another source, such as extra cash or your bank overdraft.
        </p>
      )}
    </div>
  );
}
