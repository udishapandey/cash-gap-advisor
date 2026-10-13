/** ₹ with Indian digit grouping, e.g. 500000 -> "₹5,00,000". */
export function formatINR(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/** A percentage with up to 2 decimals, e.g. 54.75 -> "54.75%". */
export function formatPct(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

/** ₹ with a minus sign in front for a negative amount: -7942 -> "−₹7,942". */
export function formatSignedINR(amount: number): string {
  return amount < 0 ? `−${formatINR(-amount)}` : formatINR(amount);
}

/** A short ₹ for headlines: 227621 -> "₹2.28L", 51637 -> "₹52K", 403605 -> "₹4.04L", 12500000 -> "₹1.25Cr". */
export function formatCompactINR(amount: number): string {
  const n = Math.abs(Math.round(amount));
  const trim = (x: number) => String(Number(x.toFixed(2)));
  const sign = amount < 0 ? "−" : "";
  if (n < 1_000) return `${sign}₹${n}`;
  if (n < 99_500) return `${sign}₹${Math.round(n / 1_000)}K`;
  if (n < 10_000_000) return `${sign}₹${trim(n / 100_000)}L`;
  return `${sign}₹${trim(n / 10_000_000)}Cr`;
}

/** "20 Oct": the date `days` after `fromIso` (YYYY-MM-DD), without any time-zone surprises. */
export function formatDayMonth(fromIso: string, days: number): string {
  const d = new Date(`${fromIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
}

/** ₹ in lakh with two decimals, for a headline amount: 490000 -> "₹4.90L". */
export function formatLakh(amount: number): string {
  return `₹${(amount / 100_000).toFixed(2)}L`;
}
