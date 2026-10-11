import type { ReactNode } from "react";

/** Marks anything that comes from made-up data. Used throughout, as the spec requires. */
export function SimulatedTag({ children = "Simulated" }: { children?: ReactNode }) {
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
  ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`rounded-xl border border-line bg-card shadow-sm p-5 ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-lg font-semibold">{children}</h2>
      {aside}
    </div>
  );
}

export function LowConfidenceBadge({ widthShare }: { widthShare: number }) {
  return (
    <span
      title={`The range between the best and worst case is ${Math.round(widthShare * 100)}% of the invoice`}
      className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800"
    >
      Low confidence: wide forecast range
    </span>
  );
}
