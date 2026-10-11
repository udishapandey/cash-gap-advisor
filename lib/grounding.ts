// Grounding check: the AI may only quote numbers that the calculation produced.
// Every ₹ amount and every % in its text must match a number in the JSON it was given (rounding allowed).
// If anything doesn't match, the AI text is thrown away and a plain template is shown instead.
// Plain TypeScript, no AI.

export interface Mention {
  /** The text as written, e.g. "₹2.3 lakh". */
  text: string;
  kind: "rupees" | "percent" | "times";
  /** The amount in rupees, or the percentage. */
  value: number;
  /** How far from a fact it may be and still count as the same number (rounding). */
  tolerance: (fact: number) => number;
}

export interface GroundingResult {
  ok: boolean;
  mentions: Mention[];
  ungrounded: Mention[];
}

/**
 * Field names or plan codes from the calculator's data that the AI repeated ("peakShortfallRupees", "keep_full").
 * They mean nothing to the founder, so text containing one is rejected.
 */
export function findLeakedNames(text: string, facts: unknown, language: "en" | "hi" = "en"): string[] {
  const names = new Set<string>();
  // The plain-word labels the AI is shown ("unsold pairs if full order"). In Hindi, an English label pasted into the
  // sentence is a leak; in English, ordinary words may repeat a label.
  const labels = new Set<string>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (/[a-z][A-Z]/.test(k)) {
          names.add(k.toLowerCase());
          const words = k.replace(/(Rupees|Percent)$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
          if (words.includes(" ")) labels.add(words);
        }
        walk(v);
      }
    }
  };
  walk(facts);
  const lower = text.toLowerCase();
  const found = [...names].filter((n) => lower.includes(n));
  if (language === "hi") found.push(...[...labels].filter((l) => lower.includes(l)));
  const snake = text.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
  return [...new Set([...found, ...snake])];
}

const DEVANAGARI_ZERO = 0x0966;

/** Devanagari digits (०-९) to 0-9, and drop invisible characters, so Hindi text is read the same way. */
function normalise(text: string): string {
  return text
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - DEVANAGARI_ZERO))
    .replace(/[​-‍﻿]/g, "");
}

const MULTIPLIERS: { pattern: string; value: number }[] = [
  { pattern: "crores?|crs?|करोड़|करोड", value: 10_000_000 },
  { pattern: "lakhs?|lacs?|लाख", value: 100_000 },
];
const MULT_WORDS = MULTIPLIERS.map((m) => m.pattern).join("|");
const NUMBER = "\\d[\\d,]*(?:\\.\\d+)?";

const multiplierOf = (word: string | undefined): number | undefined => {
  if (!word) return undefined;
  return MULTIPLIERS.find((m) => new RegExp(`^(?:${m.pattern})$`, "i").test(word))?.value;
};

function parseNumber(raw: string): { value: number; decimals: number } {
  const cleaned = raw.replace(/,+$/, "").replace(/,/g, "");
  const decimals = cleaned.includes(".") ? cleaned.split(".")[1].length : 0;
  return { value: Number(cleaned), decimals };
}

/** Every ₹ amount and % written in the text. Other numbers (pairs, days) are not checked. */
export function extractMentions(input: string): Mention[] {
  const text = normalise(input);
  const out: Mention[] = [];
  const taken: [number, number][] = [];
  const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && e > a);

  const addRupees = (m: RegExpExecArray, numRaw: string, word?: string) => {
    const start = m.index;
    const end = m.index + m[0].length;
    if (overlaps(start, end)) return;
    taken.push([start, end]);
    const { value, decimals } = parseNumber(numRaw);
    const mult = multiplierOf(word);
    if (mult) {
      // "₹2.3 lakh" is only precise to a tenth of a lakh: half of that is the rounding allowed.
      const halfUnit = (mult * Math.pow(10, -decimals)) / 2;
      out.push({ text: m[0].trim(), kind: "rupees", value: Math.round(value * mult), tolerance: () => halfUnit + 1e-6 });
    } else {
      // A plain amount: exact to the rupee, or within 1% when someone rounds it.
      out.push({ text: m[0].trim(), kind: "rupees", value, tolerance: (fact) => Math.max(1, fact * 0.01) });
    }
  };

  // ₹ / Rs / INR in front, with an optional lakh or crore word after.
  const prefixed = new RegExp(`(?:₹|\\bRs\\.?|\\bINR)\\s*(${NUMBER})(?:\\s*(${MULT_WORDS})(?![A-Za-z]))?`, "gi");
  for (let m = prefixed.exec(text); m; m = prefixed.exec(text)) addRupees(m, m[1], m[2]);

  // A lakh or crore word on its own: "2.3 lakh".
  const worded = new RegExp(`(${NUMBER})\\s*(${MULT_WORDS})(?![A-Za-z])`, "gi");
  for (let m = worded.exec(text); m; m = worded.exec(text)) addRupees(m, m[1], m[2]);

  // "5000 rupees".
  const suffixed = new RegExp(`(${NUMBER})\\s*(?:rupees?(?![A-Za-z])|रुपये|रुपए|रुपया)`, "gi");
  for (let m = suffixed.exec(text); m; m = suffixed.exec(text)) addRupees(m, m[1]);

  // A big number with no ₹ at all ("288151", "2,88,151") is read as a rupee amount too, so leaving the sign off is not a way
  // round the check. Counts of things (pairs, days) and codes such as invoice numbers are left alone.
  const bare = /(?<![A-Za-z0-9/\-.,])(\d{1,3}(?:,\d{2,3})+|\d{5,})(?:\.\d+)?(?![\w%,])(?!\s*(?:pairs?|units?|pcs|pieces|days?|जोड़े|जोड़ी|दिन))/gi;
  for (let m = bare.exec(text); m; m = bare.exec(text)) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    if (parseNumber(m[0]).value < 10_000) continue;
    addRupees(m, m[0]);
  }

  // Percentages: 18%, 54.75 percent, 27 प्रतिशत.
  const percent = /(\d+(?:\.\d+)?)\s*(?:%|per\s?cent|percent|प्रतिशत|फीसदी|फ़ीसदी)/gi;
  for (let m = percent.exec(text); m; m = percent.exec(text)) {
    const { value, decimals } = parseNumber(m[1]);
    const half = 0.5 * Math.pow(10, -decimals); // "55%" may stand for 54.75, "54.8%" for 54.75
    out.push({ text: m[0].trim(), kind: "percent", value, tolerance: () => half + 1e-9 });
  }

  // Multiples: 1.3x, 1.4×, 2 times. Only when written right after a digit, so ordinary words are left alone.
  const times = /(?<![\w.])(\d+(?:\.\d+)?)\s*(?:x|×|times)(?![A-Za-z])/gi;
  for (let m = times.exec(text); m; m = times.exec(text)) {
    const { value, decimals } = parseNumber(m[1]);
    const half = 0.5 * Math.pow(10, -decimals); // "1.3x" may stand for 1.32
    out.push({ text: m[0].trim(), kind: "times", value, tolerance: () => half + 1e-9 });
  }
  return out;
}

/** The ₹, % and multiple (x) numbers in the facts. Which pool a number belongs to comes from its key: "...Rupees", "...Percent" or "...Times". */
export function collectFactNumbers(facts: unknown): { rupees: number[]; percents: number[]; times: number[] } {
  const rupees: number[] = [];
  const percents: number[] = [];
  const times: number[] = [];
  const walk = (value: unknown, key: string) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      if (/Rupees$/.test(key)) rupees.push(Math.abs(value));
      else if (/Percent$/.test(key)) percents.push(Math.abs(value));
      else if (/Times$/.test(key)) times.push(Math.abs(value));
    } else if (Array.isArray(value)) {
      value.forEach((v) => walk(v, key));
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  walk(facts, "");
  return { rupees, percents, times };
}

/** Does every ₹ amount and % in `text` match a number in `facts`? */
export function checkGrounding(text: string, facts: unknown): GroundingResult {
  const pool = collectFactNumbers(facts);
  const mentions = extractMentions(text);
  const ungrounded = mentions.filter((m) => {
    const candidates = m.kind === "rupees" ? pool.rupees : m.kind === "percent" ? pool.percents : pool.times;
    return !candidates.some((fact) => Math.abs(m.value - fact) <= m.tolerance(fact));
  });
  return { ok: ungrounded.length === 0, mentions, ungrounded };
}
