"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Invoice } from "@/lib/data/invoice";
import { SAMPLE_BILLS, savedReadingFor } from "@/lib/data/sample-bills";
import { hashBytes, readCached, writeCached } from "@/lib/extraction-cache";
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
import { BILL_PRIVACY, billHero, LATE_FEE_LAW } from "@/lib/plain";
import { Alert, BTN, Badge, Card, Metric, PageHeader, Panel, SectionLabel } from "./ui";
import Disclosure from "./Disclosure";
import Stepper from "./Stepper";
import { useJourney } from "./JourneyProvider";

const STORAGE_KEY = "cga.confirmedInvoice.v1";
const SAMPLE_URL = "/samples/invoice-clean.pdf";
// The server gives up after 45 seconds; the page waits a little longer so it can show the server's message.
const CLIENT_TIMEOUT_MS = 35_000;
const BUSY_SAVED = "AI is busy right now. Showing the reading saved earlier.";
const BUSY_MANUAL = "AI is busy right now. Please check and fill the fields.";
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
    text: "Saved result. The bill was not read again.",
  },
  mock: {
    title: "Mock AI",
    text: "Sample values. No AI call was made.",
  },
  "pre-read": {
    title: "Read by AI earlier",
    text: "Saved reading of the sample bill.",
  },
  manual: {
    title: "Manual entry",
    text: "Enter the values from your bill. Fields marked * are required.",
  },
};

/** The AI converted a yearly late charge to a monthly one and said so in its evidence: "Printed as 18% per annum, converted to 1.5% per month". */
const convertedNote = (evidence: string | null) => evidence !== null && /^Printed as .+, converted to .+/.test(evidence);

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent"
    />
  );
}

export default function InvoiceFlow() {
  const journey = useJourney();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  /** True only after the AI failed to read a file. The fallback buttons are shown only then. */
  /** A short message above the bill, for example when the AI was busy and a saved reading is shown. */
  const [notice, setNotice] = useState<string | null>(null);
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
  const lastIsSample = useRef(false);
  /** The badge for a saved sample reading: "Read by AI earlier" for bill 1, "Saved reading" for bill 2. */
  const [savedBadge, setSavedBadge] = useState<string | null>(null);
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
    setNotice(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
    setPhase("review");
  }

  /**
   * The AI could not read the bill (busy, rate-limited, timed out, or no answer). Stop the spinner and carry on:
   * the sample bill shows its saved reading; an uploaded bill opens as manual entry; a bill that already has a reading keeps it.
   */
  function aiBusy(isSample: boolean, hadReading: boolean, fileHash: string | null = null) {
    // An unchanged sample file (found by its hash), or the sample button, shows its saved reading.
    const known = savedReadingFor(fileHash) ?? (isSample ? SAMPLE_BILLS[0] : null);
    if (known) {
      showExtraction(known.extraction, "pre-read");
      setSavedBadge(known.badge);
      setNotice(BUSY_SAVED);
    } else if (hadReading) {
      setPhase("review");
      setNotice(BUSY_SAVED);
    } else {
      showExtraction(emptyExtraction(), "manual");
      setNotice(BUSY_MANUAL);
    }
  }

  async function readFile(file: File, opts: { force?: boolean; sample?: boolean } = {}) {
    setError(null);
    setNotice(null);
    const isSample = opts.sample === true;
    const name = file.name.toLowerCase();
    if (!/\.(pdf|png|jpe?g)$/.test(name)) {
      setError("Upload a PDF, PNG or JPG.");
      return;
    }
    if (file.size > MAX_INVOICE_BYTES) {
      setError("File too large. Maximum 5 MB.");
      return;
    }
    setLastFile(file);
    lastIsSample.current = isSample;

    // Same file as before? Reuse the earlier reading instead of calling the AI. (Not in mock mode.)
    const fileHash = await hashBytes(await file.arrayBuffer());
    const hash = mockAi ? null : fileHash;
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
    const hadReading = extraction !== null;
    setPhase("reading");
    setElapsed(0);
    unconfirm();
    try {
      const body = new FormData();
      body.append("file", file);
      if (isSample) body.append("sample", "1");
      const res = await fetch("/api/parse-invoice", {
        method: "POST",
        body,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(CLIENT_TIMEOUT_MS)]),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        // An AI failure (the server says which kind) falls back at once. A wrong file type or size is the founder's to fix.
        if (data?.kind || res.status >= 500) {
          aiBusy(isSample, hadReading, fileHash);
        } else {
          setError(data?.error ?? "Couldn't read this bill. Try again.");
          setPhase(hadReading ? "review" : "idle");
        }
        return;
      }
      if (data.saved === true) {
        // The server could not reach the AI for a sample bill and sent its saved reading.
        const saved = parseExtraction(data.extraction);
        if (saved.ok) {
          showExtraction(saved.data, "pre-read");
          setSavedBadge(typeof data.badge === "string" ? data.badge : "Saved reading");
          setNotice(BUSY_SAVED);
        } else {
          aiBusy(isSample, hadReading, fileHash);
        }
        return;
      }
      const parsed = parseExtraction(data.extraction);
      if (!parsed.ok) {
        aiBusy(isSample, hadReading, fileHash);
        return;
      }
      const isMock = data.mock === true;
      if (!isMock && hash) writeCached(sessionStorage, hash, parsed.data);
      showExtraction(parsed.data, isMock ? "mock" : "live");
    } catch {
      if (controller.signal.aborted) return; // the founder started something else
      // A timeout (35 seconds) or a dropped connection: the same fallback.
      aiBusy(isSample, hadReading, fileHash);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  /** After an AI failure: values saved from an earlier reading of the synthetic sample invoice. */
  function usePreReadSample() {
    abortRef.current?.abort();
    showExtraction(SAMPLE_BILLS[0].extraction, "pre-read");
    setSavedBadge(SAMPLE_BILLS[0].badge);
  }

  /** Read the sample bill with the AI again, from the file (a live call). */
  async function readSampleAgain() {
    setError(null);
    try {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      await readFile(new File([blob], "invoice-clean.pdf", { type: "application/pdf" }), { force: true, sample: true });
    } catch {
      setError("Couldn't load the sample bill.");
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
      setError("Fix the highlighted fields to confirm.");
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
    setLastFile(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  const reading = phase === "reading";
  const billHeroView = values ? billHero(values) : null;

  // Count the seconds while reading, so a slow read is visible rather than silent.
  useEffect(() => {
    if (!reading) return;
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [reading]);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const FIELD_LABEL: Record<FieldKey, string> = {
    supplierName: "Supplier",
    invoiceNumber: "Invoice number",
    invoiceDate: "Invoice date",
    quantity: "Pairs",
    unitPrice: "Price per pair (₹)",
    totalAmount: "Amount (₹)",
    dueDate: "Due date",
    lateFeePercentPerMonth: "Late fee (% a month)",
    earlyPaymentDiscountPercent: "Discount (%)",
    earlyPaymentDiscountDays: "Pay within (days)",
  };
  // Shown by default: who, how much, when, and the discount. The rest is under "View bill details".
  const MAIN: FieldKey[] = ["supplierName", "totalAmount", "dueDate", "earlyPaymentDiscountPercent", "earlyPaymentDiscountDays"];
  const MORE: FieldKey[] = ["invoiceNumber", "invoiceDate", "quantity", "unitPrice", "lateFeePercentPerMonth"];

  /** One field: its label, the input and a small status. Confident reads get a quiet tick; unclear or missing ones are flagged. */
  const renderField = (key: FieldKey) => {
    if (!extraction || !values) return null;
    const meta = FIELDS.find((m) => m.key === key)!;
    const f = extraction[key];
    const id = `field-${key}`;
    const err = formErrors[key];
    const isEdited = edited[key];
    const missing = source !== "manual" && f.value === null && !isEdited;
    const unclear = source !== "manual" && !isEdited && f.value !== null && f.confidence !== "high";
    return (
      <div key={key}>
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={id} className="text-xs font-medium text-subtle">
            {FIELD_LABEL[key]}
            {meta.required && <span className="text-red-600"> *</span>}
          </label>
          {missing ? (
            <Badge tone="negative">Missing</Badge>
          ) : unclear ? (
            <Badge tone="notice">Needs review</Badge>
          ) : isEdited ? (
            <Badge tone="neutral">Edited</Badge>
          ) : source !== "manual" ? (
            <span aria-label="Extracted" title="Extracted automatically" className="text-xs text-green-700">
              ✓
            </span>
          ) : null}
        </div>
        <input
          id={id}
          type={meta.input === "date" ? "date" : "text"}
          inputMode={meta.input === "number" ? "decimal" : undefined}
          value={values[key]}
          onChange={(e) => setValue(key, e.target.value)}
          aria-invalid={err ? true : undefined}
          className={`mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:border-brand ${
            err ? "border-red-300" : missing || unclear ? "border-amber-300" : "border-line-strong"
          }`}
        />
        {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
        {convertedNote(f.evidence) && !isEdited && <p className="mt-1 text-xs text-muted">{f.evidence}</p>}
      </div>
    );
  };

  const needsLook = (key: FieldKey) =>
    !!extraction && source !== "manual" && !edited[key] && (extraction[key].value === null || extraction[key].confidence !== "high");
  const detailsNeedLook = !!extraction && MORE.some((k) => formErrors[k] || needsLook(k));
  const anyToCheck =
    !!extraction && source !== "manual" && FIELDS.some((m) => !edited[m.key] && (extraction[m.key].value === null || extraction[m.key].confidence !== "high"));

  return (
    <div className="space-y-6">
      <Stepper current="invoice" />
      <PageHeader
        title={phase === "review" ? (billHeroView ? "We found an early-payment opportunity" : "Review bill") : "Upload supplier bill"}
        crumbs={["Supplier bills"]}
        subtitle={phase === "review" ? undefined : "PDF, PNG or JPG, up to 5 MB"}
        actions={
          <>
            {mockAi && (
              <span title="Sample values. No AI call is made.">
                <Badge tone="neutral">Mock AI</Badge>
              </span>
            )}
            {phase === "review" && (
              <button type="button" onClick={startOver} className={BTN.secondary}>
                Upload another bill
              </button>
            )}
          </>
        }
      />

      {phase !== "review" && (
        <Card>
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
            className={`flex flex-col items-center gap-3 rounded-md border-2 border-dashed px-4 py-10 text-center ${dragging ? "border-brand bg-blue-50" : "border-line-strong"}`}
          >
            <p className="text-sm text-subtle">Drag and drop a bill, or</p>
            <div className="flex flex-wrap justify-center gap-3">
              <label className={`${BTN.primary} cursor-pointer ${reading ? "pointer-events-none opacity-50" : ""}`}>
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
              <button type="button" onClick={usePreReadSample} disabled={reading} className={BTN.secondary}>
                Use sample bill
              </button>
            </div>
            <p className="text-xs text-muted">The samples are synthetic. {BILL_PRIVACY}</p>
            <p className="text-xs text-muted">
              Download sample bills to try:{" "}
              {SAMPLE_BILLS.map((b, i) => (
                <span key={b.id}>
                  {i > 0 && " · "}
                  <a href={b.href} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-text hover:underline">
                    {b.label}
                  </a>
                </span>
              ))}
            </p>
          </div>
        </Card>
      )}

      <div aria-live="polite" className="space-y-3">
        {reading && (
          <Alert tone="information">
            <span className="flex items-center gap-2">
              <Spinner /> Reading bill… {elapsed}s
              {elapsed >= SLOW_AFTER_S && <span className="text-amber-800">Taking longer than usual.</span>}
            </span>
          </Alert>
        )}
        {notice && <Alert tone="notice">{notice}</Alert>}
        {error && <Alert tone="negative">{error}</Alert>}
      </div>

      {phase === "review" && extraction && values && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {source === "live" ? (
              <Badge tone="neutral">Extracted automatically</Badge>
            ) : (
              <span title={SOURCE_NOTICE[source].text}>
                <Badge tone="notice">{source === "pre-read" && savedBadge ? savedBadge : SOURCE_NOTICE[source].title}</Badge>
              </span>
            )}
            {(source === "cached" || source === "pre-read") && (
              <button
                type="button"
                onClick={() => (lastFile ? void readFile(lastFile, { force: true, sample: lastIsSample.current || source === "pre-read" }) : void readSampleAgain())}
                disabled={reading}
                className={BTN.link}
              >
                Read again with AI
              </button>
            )}
            {anyToCheck && <span className="text-xs text-muted">Review highlighted fields.</span>}
          </div>

          {billHeroView && (
            <Panel aria-label="Early-payment opportunity">
              <div className="flex flex-wrap items-center justify-between gap-4 p-6">
                <Metric size="lg" tone="saved" label="Early-payment discount" value={billHeroView.hero} />
                <p className="max-w-sm text-sm text-subtle">{billHeroView.caption}</p>
              </div>
            </Panel>
          )}

          <Card aria-label="Bill">
            <SectionLabel>Bill</SectionLabel>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 md:grid-cols-3">{MAIN.map((k) => renderField(k))}</div>
          </Card>

          <Disclosure title="View bill details" open={detailsOpen || detailsNeedLook} onOpenChange={setDetailsOpen}>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">{MORE.map((k) => renderField(k))}</div>
            <p className="mt-3 text-xs text-muted">{LATE_FEE_LAW}</p>
            {source !== "manual" && (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[26rem] text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs text-muted">
                      <th className="py-2 text-left font-medium">Field</th>
                      <th className="px-3 py-2 text-left font-medium">On the bill</th>
                      <th className="py-2 text-left font-medium">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {FIELDS.map((m) => (
                      <tr key={m.key}>
                        <td className="py-2 font-medium">{FIELD_LABEL[m.key]}</td>
                        <td className="px-3 py-2 text-muted">{extraction[m.key].evidence ?? "Not found"}</td>
                        <td className="py-2 capitalize">{extraction[m.key].confidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Disclosure>

          <div className="flex flex-wrap items-center gap-4">
            {confirmed ? (
              <>
                <Link href="/gap" className={BTN.primary}>
                  See cash gap
                </Link>
                <Badge tone="positive">Bill confirmed</Badge>
              </>
            ) : (
              <button type="button" onClick={confirm} disabled={reading} className={BTN.primary}>
                Confirm bill
              </button>
            )}
          </div>
          {confirmed && confirmed.notes.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
              {confirmed.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
