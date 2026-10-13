import { formatINR, inrShort } from "@/lib/format";
import { rangeBarLayout } from "@/lib/journey";

/**
 * The gap as a range: best case (high sales), expected, worst case (low sales), on a bar from ₹0.
 * The shaded stretch is everything the forecast says could happen.
 */
export default function RangeBar({ best, expected, worst }: { best: number; expected: number; worst: number }) {
  const l = rangeBarLayout(best, expected, worst);
  const marker = (pct: number, colour: string) => (
    <span
      aria-hidden
      className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${colour}`}
      style={{ left: `${pct}%` }}
    />
  );
  return (
    <div>
      <div
        role="img"
        aria-label={`Gap range from ${formatINR(best)} with high sales to ${formatINR(worst)} with low sales. Expected ${formatINR(expected)}.`}
        className="relative h-2 rounded-full bg-slate-100"
      >
        <div
          className="absolute top-0 h-2 rounded-full bg-amber-200"
          style={{ left: `${l.bestPct}%`, width: `${Math.max(0, l.worstPct - l.bestPct)}%` }}
        />
        {marker(l.bestPct, "bg-green-600")}
        {marker(l.worstPct, "bg-red-600")}
        {marker(l.expectedPct, "bg-navy")}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
        {(
          [
            ["High sales", best, "bg-green-600"],
            ["Expected", expected, "bg-navy"],
            ["Low sales", worst, "bg-red-600"],
          ] as const
        ).map(([label, value, dot]) => (
          <div key={label}>
            <dt className="flex items-center gap-1.5 text-xs text-muted">
              <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
              {label}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums">{inrShort(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
