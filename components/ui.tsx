import type { ReactNode } from "react";

/**
 * Retired: every screen used to mark each made-up number "Simulated". One banner at the top of the page now says it for the
 * whole prototype ("Concept prototype · all merchant data is simulated"), so this renders nothing. Kept so the call sites
 * and the rule in CLAUDE.md stay easy to find.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function SimulatedTag(_props: { children?: ReactNode }) {
  return null;
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
