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
