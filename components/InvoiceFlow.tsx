"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Invoice } from "@/lib/data/invoice";
import { merchant, SIMULATED_LABEL } from "@/lib/data/merchant";
import { runEngine } from "@/lib/engine";
import { formatINR } from "@/lib/format";
import {
  FIELDS,
  parseConfirmed,
  parseExtraction,
  toEngineInvoice,
  toFormValues,
  type FieldErrors,
  type FieldKey,
  type FormValues,
  type InvoiceExtraction,
} from "@/lib/invoice-extraction";
import { ACCEPTED_EXTENSIONS, MAX_INVOICE_BYTES } from "@/lib/invoice-upload";

const STORAGE_KEY = "cga.confirmedInvoice.v1";
const SAMPLE_URL = "/samples/invoice-clean.pdf";

type Phase = "idle" | "reading" | "review";
type Edited = Partial<Record<FieldKey, boolean>>;

interface Confirmed {
  invoice: Invoice;
  notes: string[];
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent"
    />
  );
}

export default function InvoiceFlow() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<InvoiceExtraction | null>(null);
  const [values, setValues] = useState<FormValues | null>(null);
  const [edited, setEdited] = useState<Edited>({});
  const [formErrors, setFormErrors] = useState<FieldErrors>({});
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Restore a confirmed invoice from this browser tab's session, if there is one.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
        if (!saved) return;
        const restored = parseExtraction(saved.extraction);
        const form = parseConfirmed(saved.values);
        if (!restored.ok || !form.ok) return;
        const mapped = toEngineInvoice(form.data);
        if (!mapped.ok) return;
        setExtraction(restored.data);
        setValues(saved.values);
        setEdited(saved.edited ?? {});
        setConfirmed({ invoice: mapped.invoice, notes: mapped.notes });
        setPhase("review");
      } catch {
        // Session storage can be blocked or hold something unexpected. Start fresh.
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const result = useMemo(
    () => (confirmed ? runEngine({ merchant, invoice: confirmed.invoice }) : null),
    [confirmed],
  );

  async function readFile(file: File) {
    setError(null);
    const name = file.name.toLowerCase();
    if (!/\.(pdf|png|jpe?g)$/.test(name)) {
      setError("Please upload a PDF, PNG or JPG invoice.");
      return;
    }
    if (file.size > MAX_INVOICE_BYTES) {
      setError("That file is too large. Please upload an invoice under 5 MB.");
      return;
    }

    setPhase("reading");
    setConfirmed(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/parse-invoice", { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const wait = res.headers.get("Retry-After");
        setError(
          (data?.error ?? "Something went wrong reading the invoice. Please try again.") +
            (res.status === 429 && wait ? ` (Try again in about ${wait} seconds.)` : ""),
        );
        setPhase(extraction ? "review" : "idle");
        return;
      }
      const parsed = parseExtraction(data.extraction);
      if (!parsed.ok) {
        setError(parsed.message);
        setPhase(extraction ? "review" : "idle");
        return;
      }
      setExtraction(parsed.data);
      setValues(toFormValues(parsed.data));
      setEdited({});
      setFormErrors({});
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {}
      setPhase("review");
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
      setPhase(extraction ? "review" : "idle");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function useSample() {
    setError(null);
    try {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      await readFile(new File([blob], "invoice-clean.pdf", { type: "application/pdf" }));
    } catch {
      setError("Couldn't load the sample invoice.");
    }
  }

  function setValue(key: FieldKey, value: string) {
    setValues((v) => (v ? { ...v, [key]: value } : v));
    setEdited((e) => ({ ...e, [key]: true }));
    setFormErrors((e) => ({ ...e, [key]: undefined }));
    setConfirmed(null); // any change means the founder must confirm again
  }

  function confirm() {
    if (!values || !extraction) return;
    const form = parseConfirmed(values);
    if (!form.ok) {
      setFormErrors(form.errors);
      setError("Some fields need fixing before this invoice can be confirmed.");
      return;
    }
    const mapped = toEngineInvoice(form.data);
    if (!mapped.ok) {
      setError(mapped.error);
      return;
    }
    setError(null);
    setFormErrors({});
    setConfirmed({ invoice: mapped.invoice, notes: mapped.notes });
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ extraction, values, edited }));
    } catch {
      // Storage unavailable (for example a private window). The summary still shows.
    }
  }

  function startOver() {
    setPhase("idle");
    setExtraction(null);
    setValues(null);
    setEdited({});
    setFormErrors({});
    setConfirmed(null);
    setError(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  const reading = phase === "reading";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-xl border border-line bg-card p-5">
        <h2 className="text-lg font-semibold">Forward a supplier invoice</h2>
        <p className="mt-1 text-sm text-muted">
          Upload a PDF, PNG or JPG (up to 5 MB). The AI reads it and you check every field before anything is
          planned. The file is processed in memory and never saved.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file && !reading) void readFile(file);
          }}
          className={`mt-4 flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-8 text-center ${
            dragging ? "border-brand bg-blue-50" : "border-line"
          }`}
        >
          <p className="text-sm text-muted">Drag an invoice here, or</p>
          <div className="flex flex-wrap justify-center gap-3">
            <label
              className={`cursor-pointer rounded-md bg-brand px-4 py-2 text-sm font-medium text-white ${
                reading ? "pointer-events-none opacity-50" : "hover:opacity-90"
              }`}
            >
              Choose file
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                disabled={reading}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void readFile(file);
                }}
              />
            </label>
            <button
              type="button"
              onClick={useSample}
              disabled={reading}
              className="rounded-md border border-line bg-card px-4 py-2 text-sm font-medium hover:bg-background disabled:opacity-50"
            >
              Use sample invoice
            </button>
          </div>
          <p className="text-xs text-muted">The sample is a synthetic invoice, not a real one.</p>
        </div>

        <div aria-live="polite" className="mt-4">
          {reading && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> Reading the invoice… this usually takes 5 to 30 seconds.
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      </section>

      {phase === "review" && extraction && values && (
        <section className="rounded-xl border border-line bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Check what the AI read</h2>
              <p className="mt-1 text-sm text-muted">
                Edit anything that is wrong. Fields marked in amber were unclear or missing.
              </p>
            </div>
            <button type="button" onClick={startOver} className="shrink-0 text-sm text-brand hover:underline">
              Start over
            </button>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {FIELDS.map((meta) => {
              const f = extraction[meta.key];
              const isEdited = edited[meta.key];
              const needsCheck = !isEdited && (f.confidence !== "high" || f.value === null);
              const id = `field-${meta.key}`;
              const err = formErrors[meta.key];
              return (
                <div
                  key={meta.key}
                  className={`rounded-lg border p-3 ${
                    err ? "border-red-300 bg-red-50" : needsCheck ? "border-amber-300 bg-amber-50" : "border-line"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor={id} className="text-sm font-medium">
                      {meta.label}
                      {meta.required && <span className="text-red-600"> *</span>}
                    </label>
                    {needsCheck && (
                      <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">
                        Please check
                      </span>
                    )}
                  </div>
                  <input
                    id={id}
                    type={meta.input === "date" ? "date" : "text"}
                    inputMode={meta.input === "number" ? "decimal" : undefined}
                    value={values[meta.key]}
                    onChange={(e) => setValue(meta.key, e.target.value)}
                    aria-invalid={err ? true : undefined}
                    className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                  {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
                  <p className="mt-2 text-xs text-muted">
                    {isEdited ? (
                      "Edited by you."
                    ) : f.value === null ? (
                      <>Not found on the invoice. {meta.hint}</>
                    ) : f.evidence ? (
                      <>
                        Evidence: <span className="italic">“{f.evidence}”</span> ({f.confidence} confidence)
                      </>
                    ) : (
                      "The AI quoted no evidence for this value."
                    )}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={confirm}
              disabled={reading}
              className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Confirm invoice
            </button>
            {confirmed && <span className="text-sm text-green-700">Confirmed. Saved in this browser tab only.</span>}
          </div>
        </section>
      )}

      {confirmed && result && (
        <section className="rounded-xl border border-line bg-card p-5">
          <h2 className="text-lg font-semibold">Cash gap for this invoice</h2>
          <p className="mt-1 text-sm text-muted">
            {confirmed.invoice.supplier}: {formatINR(confirmed.invoice.amount)} for {confirmed.invoice.units} pairs,
            due in {confirmed.invoice.dueInDays} days.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(
              [
                ["Low sales", result.views.keepFull.gap.scenarios.low],
                ["Expected sales", result.views.keepFull.gap.scenarios.expected],
                ["High sales", result.views.keepFull.gap.scenarios.high],
              ] as const
            ).map(([label, s]) => (
              <div key={label} className="rounded-lg border border-line p-3">
                <p className="text-xs uppercase tracking-wide text-muted">
                  {label} ({s.uplift}x)
                </p>
                <p className="mt-1 text-xl font-semibold">{formatINR(s.gap)}</p>
                <p className="text-xs text-muted">{s.gap === 0 ? "No gap" : "short by the due date"}</p>
              </div>
            ))}
          </div>

          <p className="mt-4 text-sm">
            Gap range: <strong>{formatINR(result.views.keepFull.gap.gapMin)}</strong> to{" "}
            <strong>{formatINR(result.views.keepFull.gap.gapMax)}</strong>
          </p>
          {result.views.keepFull.gap.lowConfidence && (
            <p className="mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
              Low confidence: wide forecast range
            </p>
          )}

          {confirmed.notes.length > 0 && (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-muted">
              {confirmed.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-xs text-amber-700">
            {SIMULATED_LABEL}: sales, COD payouts and bank balance for {merchant.name} are made up. The invoice
            is the only real input.
          </p>
        </section>
      )}
    </div>
  );
}
