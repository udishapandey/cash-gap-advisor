"use client";

import { useId, useState, type ReactNode } from "react";

/** Tabs in the Razorpay dashboard style: a row of labels with a blue underline on the open one. */
export default function Tabs({ tabs, label }: { tabs: { id: string; label: string; content: ReactNode }[]; label: string }) {
  const [active, setActive] = useState(tabs[0].id);
  const base = useId();
  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-6 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`${base}-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`${base}-${t.id}-panel`}
            onClick={() => setActive(t.id)}
            className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium ${
              active === t.id ? "border-brand text-brand-text" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`${base}-${t.id}-panel`} aria-labelledby={`${base}-${t.id}`} hidden={active !== t.id} className="pt-4">
          {t.content}
        </div>
      ))}
    </div>
  );
}
