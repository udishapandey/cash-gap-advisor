"use client";

import { useEffect, useState } from "react";

type HelloResult = { ok: boolean; reply?: string; error?: string };

export default function HelloPanel() {
  const [result, setResult] = useState<HelloResult | null>(null);

  useEffect(() => {
    fetch("/api/hello")
      .then((r) => r.json())
      .then(setResult)
      .catch((e) => setResult({ ok: false, error: String(e) }));
  }, []);

  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted">AI connection test</p>
      <div className="mt-3 text-lg">
        {result === null && <span className="text-muted">Asking the AI…</span>}
        {result?.ok && <span className="font-medium text-brand">{result.reply}</span>}
        {result && !result.ok && <span className="text-sm text-red-600">Error: {result.error}</span>}
      </div>
    </section>
  );
}
