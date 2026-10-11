// Run the real invoice reader once and show how long it took and what came back.
//   npm run try:extract                       (reads public/samples/invoice-clean.pdf)
//   npm run try:extract -- path/to/invoice.png
// Uses the key in .env.local. Prints the provider's real error if the read fails.
// Never prints the key. Only run it on synthetic or your own invoices.

import { readFileSync } from "node:fs";
import { describeFailure, extractInvoice } from "../lib/ai";
import { FIELD_KEYS } from "../lib/invoice-extraction";
import { sniffMimeType } from "../lib/invoice-upload";

async function main(): Promise<number> {
  const path = process.argv[2] ?? "public/samples/invoice-clean.pdf";
  const data = new Uint8Array(readFileSync(path));
  const mimeType = sniffMimeType(data);
  if (!mimeType) {
    console.error(`${path} is not a PDF, PNG or JPG.`);
    return 2;
  }

  console.log(`file      ${path} (${(data.length / 1024).toFixed(0)} KB, ${mimeType})`);
  console.log(`provider  ${process.env.AI_PROVIDER || "gemini"}`);
  console.log(`model     ${process.env.GEMINI_MODEL || "(default)"}   fallback ${process.env.GEMINI_FALLBACK_MODEL || "(default)"}`);

  const started = performance.now();
  const result = await extractInvoice({ data, mimeType });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);

  if (result.ok) {
    console.log(`\nOK in ${seconds}s using ${result.model} (attempt ${result.attempts})\n`);
    for (const key of FIELD_KEYS) {
      const f = result.data[key];
      console.log(`${key.padEnd(28)} ${String(f.value).padEnd(32)} ${f.confidence.padEnd(7)} ${JSON.stringify(f.evidence)}`);
    }
    return 0;
  }

  console.log(`\nFAILED after ${seconds}s`);
  console.log(`shown to user: ${result.message}`);
  console.log(`why:           ${describeFailure(result)}`);
  return 1;
}

main().then((code) => process.exit(code));
