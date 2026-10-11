// Evaluate how well one model reads the five synthetic test invoices, and record it in docs/EVAL.md.
//   npm run eval:extract -- --model gemini-3.5-flash-lite
//   npm run eval:extract -- --model gemini-3.5-flash-lite --only invoice-latefee     (one invoice)
// LIVE: makes one real AI call per invoice (5 in all), never more: a hard cap stops any extra request. Uses the key in
// .env.local, forces AI_MOCK off and the fallback model off for this process only, and never prints the key.
// The invoices are synthetic. Results go to docs/EVAL.md (one dated section per run, plus a comparison table once two
// models have run) and docs/eval-results/ (the raw numbers).

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { describeFailure, extractInvoice } from "../lib/ai";
import {
  failedScore,
  localDate,
  runDate,
  renderSection,
  renderSummary,
  scoreInvoice,
  totals,
  updateEvalDoc,
  type EvalRun,
  type Extracted,
  type GroundTruth,
  type InvoiceRun,
} from "../lib/eval-extract";
import { FIELD_KEYS, type FieldKey } from "../lib/invoice-extraction";
import { sniffMimeType } from "../lib/invoice-upload";

const ORDER = ["invoice-clean", "invoice-photo", "invoice-hidden-discount", "invoice-latefee", "invoice-hindi-mixed"];

function args(): { model: string; only: string | null } {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? (a[i + 1] ?? null) : null;
  };
  const model = get("--model");
  if (!model || model.startsWith("--")) {
    console.error("Usage: npm run eval:extract -- --model <name>   (for example gemini-3.5-flash-lite)");
    process.exit(2);
  }
  return { model, only: get("--only") };
}

async function main(): Promise<number> {
  const { model, only } = args();
  if (/mock/i.test(model)) {
    console.error("A mock is not a model. Pass a real model name.");
    return 2;
  }
  // This process only: the real model, no mock, no fallback to a different model.
  process.env.AI_MOCK = "false";
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_MODEL = model;
  process.env.GEMINI_FALLBACK_MODEL = "off";
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is missing from .env.local.");
    return 2;
  }

  const names = ORDER.filter((n) => existsSync(`eval/ground-truth/${n}.json`) && (!only || only === n));
  if (names.length === 0) {
    console.error(`No invoice matched${only ? ` "${only}"` : ""}.`);
    return 2;
  }
  const cap = names.length; // one call per invoice, never more

  // Count every real request and refuse to go past the cap.
  let calls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!/generativelanguage|anthropic/.test(url)) return realFetch(input, init);
    if (calls >= cap) throw new Error(`call cap of ${cap} reached`);
    calls += 1;
    return realFetch(input, init);
  }) as typeof fetch;

  console.log(`Model ${model}. ${names.length} invoice(s), at most ${cap} live call(s).\n`);
  const runStart = performance.now();
  const invoices: InvoiceRun[] = [];

  for (const name of names) {
    const truth = JSON.parse(readFileSync(`eval/ground-truth/${name}.json`, "utf8")) as GroundTruth & { printedText: string };
    const printed = readFileSync(truth.printedText, "utf8");
    const data = new Uint8Array(readFileSync(truth.file));
    const mimeType = sniffMimeType(data);
    if (!mimeType) {
      console.error(`${truth.file} is not a PDF, PNG or JPG.`);
      return 2;
    }

    const started = performance.now();
    const result = await extractInvoice({ data, mimeType });
    const ms = Math.round(performance.now() - started);

    let run: InvoiceRun;
    if (result.ok) {
      const extracted = Object.fromEntries(FIELD_KEYS.map((k) => [k, result.data[k]])) as Record<FieldKey, Extracted>;
      run = { name, file: truth.file, layout: truth.layout, ok: true, modelUsed: result.model, ms, score: scoreInvoice(extracted, truth, printed) };
    } else {
      run = { name, file: truth.file, layout: truth.layout, ok: false, error: describeFailure(result), ms, score: failedScore(truth) };
    }
    invoices.push(run);
    const s = run.score;
    console.log(
      `${name.padEnd(26)} ${run.ok ? `${s.fieldsCorrect}/10 fields` : "FAILED"}  discount ${s.discount.outcome}  late fee ${s.lateFee.outcome}  ${(ms / 1000).toFixed(1)}s${run.ok && !s.evidenceAllExact ? `  inexact quotes: ${s.evidenceBad.join(", ")}` : ""}${run.error ? `\n    ${run.error}` : ""}`,
    );
  }

  const now = new Date();
  const evalRun: EvalRun = { model, at: now.toISOString(), date: localDate(now), calls, totalMs: Math.round(performance.now() - runStart), invoices };
  if (only) {
    console.log("\n(--only run: not written to docs/EVAL.md)");
    return 0;
  }

  // Raw numbers, then the document.
  mkdirSync("docs/eval-results", { recursive: true });
  const safe = model.replace(/[^A-Za-z0-9._-]/g, "_");
  writeFileSync(`docs/eval-results/${runDate(evalRun)}-${safe}.json`, JSON.stringify(evalRun, null, 2) + "\n");
  const all = readdirSync("docs/eval-results")
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(`docs/eval-results/${f}`, "utf8")) as EvalRun);
  const existing = existsSync("docs/EVAL.md") ? readFileSync("docs/EVAL.md", "utf8") : null;
  writeFileSync("docs/EVAL.md", updateEvalDoc(existing, renderSection(evalRun), renderSummary(all)));

  const t = totals(evalRun);
  console.log(
    `\n${t.fieldsCorrect} of ${t.fieldsTotal} fields correct. Discount caught ${t.discountCaught}/${t.discountPresent}, late fee ${t.lateFeeCaught}/${t.lateFeePresent}, false alarms ${t.falseAlarms}. Quotes exact on ${t.evidenceExact}/${t.invoices}. Wrong-but-high ${t.wrongButHigh}. Live calls used: ${calls}/${cap}.\nWritten to docs/EVAL.md`,
  );
  return t.failedCalls > 0 ? 1 : 0;
}

main().then((code) => process.exit(code));
