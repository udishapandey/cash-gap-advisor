// One-off live check of every AI feature, with a hard cap on real requests.
//   npm run smoke:ai            (cap 8)    npm run smoke:ai -- 4 explain-hi   (cap 4, only that step)
// Uses the key in .env.local and forces AI_MOCK=false for this process only. Prints the model's raw wording, how
// long each step took and whether the grounding check passed. Never prints the key. Run only when asked (rule 7).

import { readFileSync } from "node:fs";
import { callScript, explainPlan, extractInvoice, interpretWhatIf } from "../lib/ai";
import { merchant } from "../lib/data/merchant";
import { sampleInvoice } from "../lib/data/invoice";
import { runEngine } from "../lib/engine";
import { CONFIG } from "../lib/engine/config";
import { FIELD_KEYS } from "../lib/invoice-extraction";
import { sniffMimeType } from "../lib/invoice-upload";

process.env.AI_MOCK = "false";
const CAP = Number(process.argv[2]) || 8;
const only = process.argv[3];
let calls = 0;

// Count every real request, refuse to go past the cap, and show the model's raw text.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!/generativelanguage|anthropic/.test(url)) return realFetch(input, init);
  if (calls >= CAP) throw new Error(`call cap of ${CAP} reached`);
  calls += 1;
  const model = /models\/([^:/?]+)/.exec(url)?.[1] ?? "claude";
  const t0 = performance.now();
  const res = await realFetch(input, init);
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  let raw = "";
  try {
    const body = await res.clone().json();
    raw = body?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? body?.error?.message ?? "";
  } catch {}
  console.log(`  [request ${calls}/${CAP}] ${model} -> HTTP ${res.status} in ${secs}s`);
  if (raw && !/\.(pdf|png)/.test(raw)) console.log(`  [raw model text] ${raw.slice(0, 900).replace(/\s+/g, " ")}`);
  return res;
}) as typeof fetch;

const timed = async <T>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
  if (only && only !== label) return undefined;
  console.log(`\n=== ${label}`);
  const t0 = performance.now();
  try {
    const out = await fn();
    console.log(`  total ${((performance.now() - t0) / 1000).toFixed(1)}s`);
    return out;
  } catch (e) {
    console.log(`  STOPPED: ${(e as Error).message}`);
  }
};

const engine = () =>
  runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: 0, cashElsewhere: 0, overdraftRatePct: CONFIG.overdraftRatePct });

const showText = (o: Awaited<ReturnType<typeof explainPlan>>) => {
  console.log(`  grounding check: ${o.status === "verified" ? "PASSED" : "NOT PASSED (template shown)"}${o.reason ? ` — ${o.reason}` : ""}`);
  if (o.ungrounded?.length) console.log(`  ungrounded: ${JSON.stringify(o.ungrounded)}`);
  console.log(`  shown to the founder: ${o.text.replace(/\n/g, "\n    ")}`);
};

async function main() {
  for (const [label, path] of [["extract-pdf", "public/samples/invoice-clean.pdf"], ["extract-photo", "public/samples/invoice-photo.png"]]) {
    await timed(label, async () => {
      const data = new Uint8Array(readFileSync(path));
      const r = await extractInvoice({ data, mimeType: sniffMimeType(data)! });
      if (!r.ok) return console.log(`  FAILED: ${r.message}`);
      console.log(`  OK using ${r.model}, attempt ${r.attempts}`);
      for (const k of FIELD_KEYS) console.log(`  ${k.padEnd(26)} ${String(r.data[k].value).padEnd(28)} ${r.data[k].confidence}`);
    });
  }
  await timed("explain-en", async () => showText(await explainPlan(engine(), "en")));
  await timed("explain-hi", async () => showText(await explainPlan(engine(), "hi")));
  await timed("script-en", async () => {
    const r = engine();
    const v = r.recommended;
    showText(await callScript(v.invoice, v.duePlan, "en", { extensionDays: CONFIG.extensionDays, borrowingRemovedRupees: v.askFirst.borrowingRemoved }));
  });
  for (const [i, q] of ["What if sales drop 25%?", "What if the supplier gives 15 more days?"].entries()) {
    await timed(`whatif-${i + 1}`, async () => {
      const o = await interpretWhatIf(q);
      console.log(`  question: ${q}\n  outcome: ${JSON.stringify(o)}`);
    });
  }
  console.log(`\nLive requests used: ${calls}/${CAP}`);
}
main().then(() => process.exit(0));
