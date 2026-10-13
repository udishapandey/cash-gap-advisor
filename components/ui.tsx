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
    <section className={`rounded-lg border border-line bg-card p-5 ${className}`} {...rest}>
      {children}
    </section>
  );
}

/** A card with no padding of its own, for a card made of rows with rules between them. */
export function Panel({ children, className = "", ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`rounded-lg border border-line bg-card ${className}`} {...rest}>
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

/** A dashboard stat: a small label, a big number and a short caption. Red is only for "short" amounts, green only for savings. */
export function StatCard({
  label,
  value,
  caption,
  tone = "plain",
  big = false,
  children,
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: "plain" | "short" | "saved";
  big?: boolean;
  children?: ReactNode;
}) {
  const colour = tone === "short" ? "text-red-700" : tone === "saved" ? "text-green-700" : "text-foreground";
  return (
    <section aria-label={label} className="rounded-lg border border-line bg-card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 font-heading font-semibold tabular-nums ${colour} ${big ? "text-4xl" : "text-2xl"}`}>{value}</p>
      {caption ? <p className="mt-1 text-sm text-muted">{caption}</p> : null}
      {children}
    </section>
  );
}

// ---------- The product's building blocks, in the Razorpay dashboard style ----------
// A light page, white cards with a thin border and an 8px corner, a dark top bar, one blue action, no shadows to speak of.

/** Button classes: one height (40px) for every button. */
export const BTN = {
  primary:
    "inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-card px-4 text-sm font-medium text-foreground hover:bg-background disabled:cursor-not-allowed disabled:opacity-50",
  link: "inline-flex items-center text-sm font-medium text-brand-text hover:underline",
} as const;

/** The page's title block: a breadcrumb, the title, one line under it, and the page's actions on the right. */
export function PageHeader({
  title,
  subtitle,
  crumbs,
  actions,
}: {
  title: string;
  subtitle?: string;
  crumbs?: string[];
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {crumbs && crumbs.length > 0 && <p className="text-xs text-muted">{crumbs.join(" / ")}</p>}
        <h1 className="font-heading text-2xl font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </header>
  );
}

/** A small uppercase section label, like "PAYMENT PRODUCTS" in the dashboard's sidebar. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{children}</h2>;
}

type Tone = "neutral" | "positive" | "negative" | "notice" | "information";
const TONE: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  positive: "bg-green-50 text-green-700",
  negative: "bg-red-50 text-red-700",
  notice: "bg-amber-50 text-amber-800",
  information: "bg-blue-50 text-blue-700",
};

/** A status badge: a small rectangle with a soft background, never a pill. */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${TONE[tone]}`}>{children}</span>;
}

/** A full-width message strip. */
export function Alert({ tone = "information", children }: { tone?: Tone; children: ReactNode }) {
  const border: Record<Tone, string> = {
    neutral: "border-line",
    positive: "border-green-200",
    negative: "border-red-200",
    notice: "border-amber-200",
    information: "border-blue-200",
  };
  return (
    <div role={tone === "negative" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${TONE[tone]} ${border[tone]}`}>
      {children}
    </div>
  );
}

/** A figure with its label: the building block of every summary row. Red only for a shortfall, green only for a benefit. */
export function Metric({
  label,
  value,
  caption,
  tone = "plain",
  size = "md",
}: {
  label: string;
  value: ReactNode;
  caption?: string;
  tone?: "plain" | "short" | "saved";
  size?: "md" | "lg";
}) {
  const colour = tone === "short" ? "text-red-700" : tone === "saved" ? "text-green-700" : "text-foreground";
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 font-heading font-semibold tabular-nums ${colour} ${size === "lg" ? "text-3xl" : "text-xl"}`}>{value}</p>
      {caption ? <p className="mt-0.5 text-xs text-muted">{caption}</p> : null}
    </div>
  );
}

/** Label and value rows with a rule between them, for a summary that is read down, not across. */
export function KeyValues({ rows }: { rows: { label: string; value: ReactNode; strong?: boolean }[] }) {
  return (
    <dl className="divide-y divide-line text-sm">
      {rows.map((r) => (
        <div key={r.label} className={`flex items-center justify-between gap-4 py-2.5 ${r.strong ? "font-semibold" : ""}`}>
          <dt className={r.strong ? "" : "text-muted"}>{r.label}</dt>
          <dd className="tabular-nums">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The colour of each funding source, the same on the Plan bar, the Home tiles and the Approve screen. */
export const SOURCE_COLOUR: Record<string, string> = {
  own_cash: "bg-green-600",
  bank_overdraft: "bg-slate-500",
  credit_line: "bg-amber-500",
  early_settlement: "bg-brand",
  split_order: "bg-slate-300",
};

/** A small, separate panel inside a card: an accent bar and a label on top, the content below. For summaries read across. */
export function Tile({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={label} className={`overflow-hidden rounded-lg border border-line bg-background ${className}`}>
      <div className="h-1 bg-brand" aria-hidden />
      <div className="p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-text">{label}</h3>
        <div className="mt-3">{children}</div>
      </div>
    </section>
  );
}

/** One funding source: a coloured dot, its name and its amount, large enough to catch the eye. */
export function SourceRow({ id, label, amount, note }: { id: string; label: string; amount: string; note?: string }) {
  return (
    <li className="py-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm">
          <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${SOURCE_COLOUR[id] ?? "bg-slate-300"}`} />
          {label}
        </span>
        <span className="text-base font-semibold tabular-nums">{amount}</span>
      </div>
      {note && <p className="ml-[18px] text-xs text-muted">{note}</p>}
    </li>
  );
}
