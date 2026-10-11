"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Invoice } from "@/lib/data/invoice";
import { preReadSampleExtraction } from "@/lib/data/sample-extraction";
import { hashBytes, readCached, writeCached } from "@/lib/extraction-cache";
import { formatINR } from "@/lib/format";
import {
  FIELDS,
  emptyExtraction,
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
import Disclosure from "./Disclosure";
import { useJourney } from "./JourneyProvider";

const STORAGE_KEY = "cga.confirmedInvoice.v1";
const SAMPLE_URL = "/samples/invoice-clean.pdf";
// The server gives up after 45 seconds; the page waits a little longer so it can show the server's message.
const CLIENT_TIMEOUT_MS = 50_000;
const SLOW_AFTER_S = 15;

type Phase = "idle" | "reading" | "review";
/** Where the values on screen came from. */
type Source = "live" | "cached" | "mock" | "pre-read" | "manual";
const SOURCES: Source[] = ["live", "cached", "mock", "pre-read", "manual"];
type Edited = Partial<Record<FieldKey, boolean>>;

interface Confirmed {
  invoice: Invoice;
  notes: string[];
}

const SOURCE_NOTICE: Record<Exclude<Source, "live">, { title: string; text: string }> = {
  cached: {
    title: "Read earlier",
    text: "This file was already read in this browser tab, so the saved result is shown and the AI was not called.",
  },
  mock: {
    title: "Mock AI",
    text: "Development mode: these are saved sample values, returned without calling the AI.",
  },
  "pre-read": {
    title: "Pre-read — AI unavailable",
    text: "These values were saved from an earlier reading of the synthetic sample invoice. The AI did not read a file just now.",
  },
  manual: {
    title: "Manual entry",
    text: "The AI did not read this invoice. Type the values from your invoice. Fields marked * are needed to plan the cash gap.",
  },
};

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent"
    />
  );
}

/** The fields the founder cares about first. The rest sit under "More details". */
const MAIN_FIELDS = [
  "totalAmount",
  "dueDate",
  "earlyPaymentDiscountPercent",
  "earlyPaymentDiscountDays",
  "lateFeePercentPerMonth",
] as const;

export default function InvoiceFlow() {
  const [moreOpen, setMoreOpen] = useState(false);
  const journey = useJourney();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  /** True only after the AI failed to read a file. The fallback buttons are shown only then. */
  const [aiFailed, setAiFailed] = useState(false);
  const [extraction, setExtraction] = useState<InvoiceExtraction | null>(null);
  const [values, setValues] = useState<FormValues | null>(null);
  const [edited, setEdited] = useState<Edited>({});
  const [formErrors, setFormErrors] = useState<FieldErrors>({});
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);
  const [dragging, setDragging] = useState(false);
  const [source, setSource] = useState<Source>("live");
  const [mockAi, setMockAi] = useState(false);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Is development mock mode on? (AI_MOCK=true on the server.)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai-status")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setMockAi(d?.mock === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
        setSource(SOURCES.includes(saved.source) ? saved.source : "live");
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

  // The confirmed invoice also lives in the journey, so the later steps can use it. If this page restored
  // a confirmed invoice that the journey doesn't have yet, hand it over.
  const { ready, state: journeyState, setInvoice, clearInvoice } = journey;
  useEffect(() => {
    if (confirmed && ready && journeyState.invoice === null) setInvoice(confirmed.invoice, confirmed.notes);
  }, [confirmed, ready, journeyState.invoice, setInvoice]);

  /** The invoice is being replaced or edited: it is no longer confirmed, here or in the journey. */
  function unconfirm() {
    setConfirmed(null);
    clearInvoice();
  }

  /** Put values on screen for the founder to check, whatever their source. */
  function showExtraction(next: InvoiceExtraction, from: Source) {
    setExtraction(next);
    setValues(toFormValues(next));
    setEdited({});
    setFormErrors({});
    unconfirm();
    setSource(from);
    setError(null);
    setAiFailed(false);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
    setPhase("review");
  }

  async function readFile(file: File, opts: { force?: boolean } = {}) {
    setError(null);
    setAiFailed(false);
    const name = file.name.toLowerCase();
    if (!/\.(pdf|png|jpe?g)$/.test(name)) {
      setError("Please upload a PDF, PNG or JPG invoice.");
      return;
    }
    if (file.size > MAX_INVOICE_BYTES) {
      setError("That file is too large. Please upload an invoice under 5 MB.");
      return;
    }
    setLastFile(file);

    // Same file as before? Reuse the earlier reading instead of calling the AI. (Not in mock mode.)
    const hash = mockAi ? null : await hashBytes(await file.arrayBuffer());
    if (hash && !opts.force) {
      try {
        const hit = readCached(sessionStorage, hash);
        if (hit) {
          showExtraction(hit, "cached");
          if (fileInput.current) fileInput.current.value = "";
          return;
        }
      } catch {}
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("reading");
    setElapsed(0);
    unconfirm();
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/parse-invoice", {
        method: "POST",
        body,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(CLIENT_TIMEOUT_MS)]),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const wait = res.headers.get("Retry-After");
        setError(
          (data?.error ?? "Something went wrong reading the invoice. Please try again.") +
            (res.status === 429 && wait && Number(wait) <= 120 ? ` (Try again in about ${wait} seconds.)` : ""),
        );
        // Only an AI failure (the server says which kind) offers the fallbacks. A wrong file type or size does not.
        setAiFailed(Boolean(data?.kind));
        setPhase(extraction ? "review" : "idle");
        return;
      }
      const parsed = parseExtraction(data.extraction);
      if (!parsed.ok) {
        setError(parsed.message);
        setAiFailed(true);
        setPhase(extraction ? "review" : "idle");
        return;
      }
      const isMock = data.mock === true;
      if (!isMock && hash) writeCached(sessionStorage, hash, parsed.data);
      showExtraction(parsed.data, isMock ? "mock" : "live");
    } catch (e) {
      if (controller.signal.aborted) return; // the founder started something else
      setError(
        e instanceof Error && e.name === "TimeoutError"
          ? "The AI took too long to respond."
          : "Couldn't reach the server. Please check your connection and try again.",
      );
      setAiFailed(true);
      setPhase(extraction ? "review" : "idle");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  /** After an AI failure: values saved from an earlier reading of the synthetic sample invoice. */
  function usePreReadSample() {
    abortRef.current?.abort();
    showExtraction(preReadSampleExtraction, "pre-read");
  }

  /** After an AI failure: an empty form for the founder to fill in. */
  function enterManually() {
    abortRef.current?.abort();
    showExtraction(emptyExtraction(), "manual");
  }

  async function useSample() {
    setError(null);
    setAiFailed(false);
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
    unconfirm(); // any change means the founder must confirm again
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
    setInvoice(mapped.invoice, mapped.notes);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ extraction, values, edited, source }));
    } catch {
      // Storage unavailable (for example a private window). The summary still shows.
    }
  }

  function startOver() {
    abortRef.current?.abort();
    setPhase("idle");
    setExtraction(null);
    setValues(null);
    setEdited({});
    setFormErrors({});
    unconfirm();
    setError(null);
    setAiFailed(false);
    setLastFile(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  const reading = phase === "reading";

  // Count the seconds while reading, so a slow read is visible rather than silent.
  useEffect(() => {
    if (!reading) return;
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [reading]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-xl border border-line bg-card shadow-sm p-5">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Forward a supplier invoice</h2>
          {mockAi && (
            <span
              title="AI_MOCK is on: saved sample values are returned and no AI is called."
              className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800"
            >
              Mock AI
            </span>
          )}
        </div>
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
              className={`cursor-pointer rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white ${
                reading ? "pointer-events-none opacity-50" : "hover:bg-brand-hover"
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
              className="rounded-md border border-brand-border text-brand-text bg-card px-4 py-2 text-sm font-medium hover:bg-background disabled:opacity-50"
            >
              Use sample invoice
            </button>
          </div>
          <p className="text-xs text-muted">The sample is a synthetic invoice, not a real one.</p>
        </div>

        <div aria-live="polite" className="mt-4">
          {reading && (
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm text-muted">
                <Spinner /> Reading your invoice… this can take up to 45 seconds. ({elapsed}s)
              </p>
              {elapsed >= SLOW_AFTER_S && (
                <p className="text-sm text-amber-700">Still working. The AI is slower than usual right now.</p>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {aiFailed && !reading && (
            <div className="mt-3 rounded-md border border-line px-3 py-3">
              <p className="text-sm font-medium">The AI couldn&apos;t read this invoice. You can still continue:</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={usePreReadSample}
                  className="rounded-md border border-brand px-4 py-2 text-sm font-medium text-brand hover:bg-blue-50"
                >
                  Continue with pre-read sample
                </button>
                <button
                  type="button"
                  onClick={enterManually}
                  className="rounded-md border border-brand-border text-brand-text px-4 py-2 text-sm font-medium hover:bg-background"
                >
                  Enter invoice manually
                </button>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-muted">
                <li>
                  <strong>Pre-read — AI unavailable:</strong> values saved from an earlier reading of the synthetic
                  sample invoice. The AI will not read a file this time.
                </li>
                <li>
                  <strong>Manual:</strong> an empty form to type the values from your invoice.
                </li>
              </ul>
            </div>
          )}
        </div>
      </section>

      {phase === "review" && extraction && values && (
        <section className="rounded-xl border border-line bg-card shadow-sm p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {source === "manual"
                  ? "Enter the invoice manually"
                  : source === "pre-read"
                    ? "Check the pre-read sample"
                    : "Check what the AI read"}
              </h2>
              {source !== "manual" && (
                <p className="mt-1 text-sm text-muted">
                  Edit anything that is wrong. Fields marked in amber were unclear or missing.
                </p>
              )}
              {source !== "live" && (
                <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <strong>{SOURCE_NOTICE[source].title}:</strong> {SOURCE_NOTICE[source].text}
                  {source === "cached" && lastFile && (
                    <>
                      {" "}
                      <button
                        type="button"
                        onClick={() => void readFile(lastFile, { force: true })}
                        disabled={reading}
                        className="font-medium text-brand underline disabled:opacity-50"
                      >
                        Read again with the AI
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <button type="button" onClick={startOver} className="shrink-0 text-sm text-brand hover:underline">
              Start over
            </button>
          </div>

          {(() => {
            const checkNeeded = (key: FieldKey) =>
              source !== "manual" && !edited[key] && (extraction[key].confidence !== "high" || extraction[key].value === null);

            /** One field: its label, the input, and a one-line status. The AI's quote is a small icon with a tooltip. */
            const renderField = (meta: (typeof FIELDS)[number], big: boolean) => {
              const f = extraction[meta.key];
              const isEdited = edited[meta.key];
              const needsCheck = checkNeeded(meta.key);
              const id = `field-${meta.key}`;
              const err = formErrors[meta.key];
              const unclear = f.confidence !== "high";
              return (
                <div
                  key={meta.key}
                  className={`rounded-lg border p-3 ${
                    err ? "border-red-300 bg-red-50" : needsCheck ? "border-amber-300 bg-amber-50" : "border-line"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor={id} className={big ? "text-sm font-semibold" : "text-sm font-medium"}>
                      {meta.label}
                      {meta.required && <span className="text-red-600"> *</span>}
                    </label>
                    {needsCheck && (
                      <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">Please check</span>
                    )}
                  </div>
                  <input
                    id={id}
                    type={meta.input === "date" ? "date" : "text"}
                    inputMode={meta.input === "number" ? "decimal" : undefined}
                    value={values[meta.key]}
                    onChange={(e) => setValue(meta.key, e.target.value)}
                    aria-invalid={err ? true : undefined}
                    className={`mt-2 w-full rounded-md border border-line bg-white px-3 py-2 outline-none focus:border-brand ${big ? "text-base font-semibold" : "text-sm"}`}
                  />
                  {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                    {isEdited ? (
                      "Edited by you."
                    ) : source === "manual" ? (
                      <>Type this from your invoice. {meta.hint}</>
                    ) : f.value === null ? (
                      <>Not found on the invoice. {meta.hint}</>
                    ) : f.evidence ? (
                      <span
                        tabIndex={0}
                        title={`${unclear ? "Unclear, please check. " : ""}The AI read this from your invoice: “${f.evidence}”`}
                        aria-label={`${unclear ? "Unclear, please check. " : ""}The AI read this from your invoice: ${f.evidence}`}
                        className={`inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full text-[11px] font-bold ${
                          unclear ? "bg-amber-200 text-amber-900" : "bg-green-100 text-green-800"
                        }`}
                      >
                        {unclear ? "!" : "✓"}
                      </span>
                    ) : (
                      "The AI quoted nothing for this value."
                    )}
                  </p>
                </div>
              );
            };

            const main = MAIN_FIELDS.map((key) => FIELDS.find((m) => m.key === key)!);
            const more = FIELDS.filter((m) => !(MAIN_FIELDS as readonly FieldKey[]).includes(m.key));
            const moreNeedsLook = more.some((m) => formErrors[m.key] || checkNeeded(m.key));
            return (
              <>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">{main.map((m) => renderField(m, true))}</div>
                <Disclosure
                  title="More details"
                  hint="supplier, invoice number, date, pairs, price"
                  open={moreOpen || moreNeedsLook}
                  onOpenChange={setMoreOpen}
                  className="mt-4"
                >
                  <div className="grid gap-4 sm:grid-cols-2">{more.map((m) => renderField(m, false))}</div>
                </Disclosure>
              </>
            );
          })()}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={confirm}
              disabled={reading}
              className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
            >
              Confirm invoice
            </button>
            {confirmed && <span className="text-sm text-green-700">Confirmed. Saved in this browser tab only.</span>}
          </div>
        </section>
      )}

      {confirmed && (
        <section className="rounded-xl border border-green-300 bg-card p-5">
          <h2 className="text-lg font-semibold">Invoice confirmed ✓</h2>
          <p className="mt-1 text-sm text-muted">
            {confirmed.invoice.supplier}: {formatINR(confirmed.invoice.amount)} for {confirmed.invoice.units} pairs,
            due in {confirmed.invoice.dueInDays} days.
          </p>
          {source !== "live" && (
            <p className="mt-1 text-xs text-muted">Values from: {SOURCE_NOTICE[source].title.toLowerCase()}.</p>
          )}
          {confirmed.notes.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
              {confirmed.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <Link
            href="/gap"
            className="mt-4 inline-block rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            Continue to the cash gap →
          </Link>
        </section>
      )}
    </div>
  );
}
