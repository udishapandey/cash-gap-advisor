/** ₹ with Indian digit grouping, e.g. 500000 -> "₹5,00,000". */
export function formatINR(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/** A percentage with up to 2 decimals, e.g. 54.75 -> "54.75%". */
export function formatPct(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}
