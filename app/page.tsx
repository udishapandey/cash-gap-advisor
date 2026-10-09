"use client";

import { useEffect, useState } from "react";

type HelloResult = { ok: boolean; reply?: string; error?: string };

// Placeholder tiles. Not real numbers.
const STATS = [
  { label: "Cash in (7 days)", value: "₹ —" },
  { label: "Cash out (7 days)", value: "₹ —" },
  { label: "Projected gap", value: "₹ —" },
];

export default function Home() {
  const [result, setResult] = useState<HelloResult | null>(null);

  useEffect(() => {
    fetch("/api/hello")
      .then((r) => r.json())
      .then(setResult)
      .catch((e) => setResult({ ok: false, error: String(e) }));
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted">{s.label}</p>
            <p className="mt-2 text-2xl font-semibold">{s.value}</p>
            <p className="mt-1 text-xs text-amber-700">Simulated placeholder</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-line bg-card p-5">
        <p className="text-xs uppercase tracking-wide text-muted">AI connection test</p>
        <div className="mt-3 text-lg">
          {result === null && <span className="text-muted">Asking the AI…</span>}
          {result?.ok && <span className="font-medium text-brand">{result.reply}</span>}
          {result && !result.ok && (
            <span className="text-sm text-red-600">Error: {result.error}</span>
          )}
        </div>
      </section>
    </div>
  );
}
