"use client";

import { useState } from "react";

const parse = (text: string) => Number(text.replace(/[₹,%\s]/g, ""));

/**
 * A number the founder can type, with Indian-style commas allowed. A valid number is passed up as they
 * type (so the engine reruns live); an invalid one shows a message and changes nothing.
 */
export default function NumberField({
  id,
  label,
  value,
  onCommit,
  prefix,
  suffix,
  min = 0,
  max,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onCommit: (value: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  hint?: string;
}) {
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  const [error, setError] = useState<string | null>(null);

  // If the value changes from outside, show it. Don't disturb what the founder is typing.
  if (value !== lastValue) {
    setLastValue(value);
    if (parse(text) !== value) setText(String(value));
  }

  function change(next: string) {
    setText(next);
    const n = parse(next);
    if (next.trim() === "" || !Number.isFinite(n)) return setError("Enter a number.");
    if (n < min) return setError(`Can't be less than ${min}.`);
    if (max !== undefined && n > max) return setError(`Can't be more than ${max}.`);
    setError(null);
    onCommit(n);
  }

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div
        className={`mt-1 flex items-center rounded-md border bg-white px-3 focus-within:border-brand ${
          error ? "border-red-300" : "border-line"
        }`}
      >
        {prefix && <span className="mr-1 text-sm text-muted">{prefix}</span>}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => change(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help`}
          className="w-full bg-transparent py-2 text-sm outline-none"
        />
        {suffix && <span className="ml-1 whitespace-nowrap text-sm text-muted">{suffix}</span>}
      </div>
      <p id={`${id}-help`} className={`mt-1 text-xs ${error ? "text-red-700" : "text-muted"}`}>
        {error ?? hint}
      </p>
    </div>
  );
}
