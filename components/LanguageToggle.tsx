"use client";

import { LANGUAGES, LANGUAGE_LABELS, type Language } from "@/lib/language";

/** English / Hindi. */
export default function LanguageToggle({
  value,
  onChange,
  label = "Language",
}: {
  value: Language;
  onChange: (l: Language) => void;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-line text-xs">
      {LANGUAGES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          aria-pressed={value === l}
          className={`px-2.5 py-1 ${value === l ? "bg-brand text-white" : "bg-card hover:bg-background"}`}
        >
          {LANGUAGE_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
