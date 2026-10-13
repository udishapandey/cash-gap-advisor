// Plain-text templates, in English and Hindi. Used three ways:
//   1. as the mock "AI" answer when AI_MOCK=true,
//   2. as the fallback shown when the AI is unavailable or its text fails the grounding check,
//   3. as a baseline the tests compare against.
// Every number comes straight from the facts. Nothing is calculated here. (The Hindi wording was drafted
// by an AI assistant: have a native speaker review it before real use.)

import type { ExplainFacts, ResultsFacts, ScriptFacts } from "./ai-facts";
import { formatINR } from "./format";
import type { Language } from "./language";

const inr = formatINR;

/** The explanation as three labelled parts, each shown as its own block. */
export interface ExplanationParts {
  doThis: string;
  whyCheapest: string;
  watchOut: string;
}

export const PART_LABELS: Record<Language, Record<keyof ExplanationParts, string>> = {
  en: { doThis: "Do this", whyCheapest: "Why this is cheapest", watchOut: "Watch out" },
  hi: { doThis: "यह करें", whyCheapest: "यह सबसे सस्ता क्यों है", watchOut: "ध्यान रखें" },
};

/** The plain Hindi name of each funding source, keyed by the English name the facts carry. */
const HINDI_SOURCE_NAMES: Record<string, string> = {
  "your Razorpay sales money early": "Razorpay की बिक्री का पैसा जल्दी",
  "Razorpay credit line": "Razorpay क्रेडिट लाइन",
  "your bank's overdraft": "आपके बैंक का ओवरड्राफ्ट",
  "delivering some pairs later": "कुछ जोड़ी बाद में डिलीवर करवाना",
};

/** A funding source's name in the language of the text. The English name is the one carried in the facts. */
export const sourceName = (source: string, lang: Language): string => (lang === "hi" ? (HINDI_SOURCE_NAMES[source] ?? source) : source);

/** What to do, why it is the cheapest, and what to watch out for. Plain words, same facts in both languages. */
export function templateExplanationParts(facts: ExplainFacts, language: Language): ExplanationParts {
  const hi = language === "hi";
  const rightSized = facts.recommendedPlan === "right_sized";
  const v = rightSized ? facts.rightSized : facts.keepFull;
  const r = facts.ratesPercent;
    const partOrder = rightSized && v.pairs < facts.pairsOrdered;

  // 1. Do this: the order, the date, the funding sources with amounts.
  const order = hi
    ? partOrder
      ? `अभी ${facts.pairsOrdered} में से ${v.pairs} जोड़ी का ऑर्डर मंगवाएँ`
      : `पूरे ${facts.pairsOrdered} जोड़ी का ऑर्डर मंगवाएँ`
    : partOrder
      ? `Order ${v.pairs} of ${facts.pairsOrdered} pairs now`
      : `Order all ${facts.pairsOrdered} pairs`;
  const pay = v.paysEarlyForDiscount
    ? hi
      ? `${v.earlyPaymentDiscountPercent}% छूट पाने के लिए दिन ${v.payByDay} तक सप्लायर को भुगतान करें।`
      : `pay the supplier by day ${v.payByDay} to get the ${v.earlyPaymentDiscountPercent}% discount.`
    : hi
      ? `दिन ${v.payByDay} तक सप्लायर को भुगतान करें।`
      : `pay the supplier by day ${v.payByDay}.`;
  const steps = v.steps.map((s) => `${sourceName(s.source, language)} ${inr(s.amountRupees)}`).join(hi ? ", फिर " : ", then ");
  const funding =
    v.steps.length === 0
      ? hi
        ? "आपको कर्ज़ लेने की ज़रूरत नहीं है: आपका कैश इनवॉइस के लिए काफ़ी है।"
        : "You do not need to borrow: your cash covers the invoice."
      : hi
        ? `नकदी की कमी इस तरह पूरी करें: ${steps}।`
        : `Cover the cash gap with ${steps}.`;
  const doThis = hi ? `${order} और ${pay} ${funding}` : `${order} and ${pay} ${funding}`;

  // 2. Why it is the cheapest: total cost against what the discount saves.
  let whyCheapest: string;
  if (v.paysEarlyForDiscount && v.netSavingFromEarlyPaymentRupees > 0) {
    whyCheapest = hi
      ? v.extraCostOfPayingEarlyRupees > 0
        ? `कुल ब्याज और फीस ${inr(v.fundingCostRupees)} है, जो दिन ${facts.dueInDays} पर भुगतान से सिर्फ़ ${inr(v.extraCostOfPayingEarlyRupees)} ज़्यादा है, और ${v.earlyPaymentDiscountPercent}% छूट से ${inr(v.earlyPaymentDiscountRupees)} बचते हैं, इसलिए जल्दी भुगतान करने से आपको ${inr(v.netSavingFromEarlyPaymentRupees)} का फ़ायदा होता है, दिन ${facts.dueInDays} पर भुगतान की तुलना में।`
        : `कुल ब्याज और फीस ${inr(v.fundingCostRupees)} है और ${v.earlyPaymentDiscountPercent}% छूट से ${inr(v.earlyPaymentDiscountRupees)} बचते हैं, इसलिए जल्दी भुगतान करने से आपको ${inr(v.netSavingFromEarlyPaymentRupees)} का फ़ायदा होता है, दिन ${facts.dueInDays} पर भुगतान की तुलना में।`
      : v.extraCostOfPayingEarlyRupees > 0
        ? `Interest and fees come to ${inr(v.fundingCostRupees)} in all, only ${inr(v.extraCostOfPayingEarlyRupees)} more than paying on day ${facts.dueInDays}, and the ${v.earlyPaymentDiscountPercent}% discount saves ${inr(v.earlyPaymentDiscountRupees)}, so you come out ${inr(v.netSavingFromEarlyPaymentRupees)} better off than paying on day ${facts.dueInDays}.`
        : `Interest and fees come to ${inr(v.fundingCostRupees)} in all and the ${v.earlyPaymentDiscountPercent}% discount saves ${inr(v.earlyPaymentDiscountRupees)}, so you come out ${inr(v.netSavingFromEarlyPaymentRupees)} better off than paying on day ${facts.dueInDays}.`;
  } else if (v.peakShortfallRupees > 0) {
    whyCheapest = hi
      ? `कुल ब्याज और फीस ${inr(v.fundingCostRupees)} है, जो आपके विकल्पों में सबसे कम है: ओवरड्राफ्ट ${r.overdraftAnnualPercent}% सालाना और क्रेडिट लाइन ${r.creditLineAnnualPercent}% सालाना है, और बिक्री का पैसा आते ही दोनों चुका दिए जाते हैं।`
      : `Interest and fees come to ${inr(v.fundingCostRupees)} in all, the lowest of your options: your overdraft costs ${r.overdraftAnnualPercent}% a year and your credit line ${r.creditLineAnnualPercent}%, both repaid as your sales money arrives.`;
  } else {
    whyCheapest = hi ? "आपको उधार नहीं लेना है, इसलिए फंडिंग का कोई खर्च नहीं है।" : "You do not need to borrow, so there is no funding cost.";
  }

  // 3. Watch out: the main risk. Every figure is for the pairs of THIS plan's order, at expected and at lower sales.
  const n = v.pairs;
  const u = v.unsoldPairsAtExpectedSales;
  const lu = v.unsoldPairsAtLowSales;
  const lowPart = hi
    ? `कम बिक्री पर लगभग ${lu} जोड़ी (${v.unsoldAtLowSalesPercent}%) बच सकती हैं`
    : `at lower sales about ${lu} pairs (${v.unsoldAtLowSalesPercent}%) could be left over`;
  let sales: string;
  if (u > 0) {
    sales = hi
      ? `अनुमानित बिक्री पर लगभग ${u} जोड़ी (${v.unsoldAtExpectedSalesPercent}%) बच सकती हैं, और ${lowPart}।`
      : `At expected sales about ${u} pairs (${v.unsoldAtExpectedSalesPercent}%) could be left over, and ${lowPart}.`;
  } else if (lu > 0) {
    sales = hi ? `अनुमानित बिक्री पर सभी ${n} जोड़ी बिक जानी चाहिए; ${lowPart}।` : `At expected sales all ${n} pairs should sell; ${lowPart}.`;
  } else {
    sales = hi
      ? `अनुमानित बिक्री पर और कम बिक्री पर भी सभी ${n} जोड़ी बिक जानी चाहिए; जोखिम यह है कि बिक्री और गिर जाए और आपको ज़्यादा उधार लेना पड़े।`
      : `At expected sales, and at lower sales too, all ${n} pairs should sell; the risk is that sales fall even further and you need to borrow more.`;
  }
  let watchOut = partOrder
    ? hi
      ? `कम जोड़ी मँगाने पर अगर बिक्री अनुमान से ज़्यादा रही तो स्टॉक कम पड़ सकता है। ${sales}`
      : `Ordering fewer pairs could leave you short of stock if sales beat the forecast. ${sales}`
    : sales;
  if (!v.fullyCovered) {
    watchOut = (hi ? `चेतावनी: यह प्लान कमी का ${inr(v.uncoveredRupees)} पूरा नहीं करता। ` : `Warning: this plan leaves ${inr(v.uncoveredRupees)} of the cash gap uncovered. `) + watchOut;
  }
  if (facts.lowConfidenceForecast) {
    watchOut += hi ? " बिक्री का अनुमान अनिश्चित है, इसलिए मंज़ूरी से पहले संख्याएँ दोबारा देख लें।" : " The forecast is uncertain, so check the numbers again before you approve.";
  }
  return { doThis, whyCheapest, watchOut };
}

/** The three parts as one paragraph. */
export function templateExplanation(facts: ExplainFacts, language: Language): string {
  const p = templateExplanationParts(facts, language);
  return [p.doThis, p.whyCheapest, p.watchOut].join(" ");
}

/** Talking points for a phone call to the supplier. One point per line, each starting with "- ". */
export function templateScript(f: ScriptFacts, language: Language): string {
  const hi = language === "hi";
  const lines: string[] = [];
  const invoice = f.invoiceNumber ? (hi ? `इनवॉइस ${f.invoiceNumber}` : `invoice ${f.invoiceNumber}`) : hi ? "इनवॉइस" : "the invoice";

  lines.push(
    hi
      ? `- शुरुआत विनम्रता से करें: कहें कि आप ${f.supplierName} के साथ काम करने की क़द्र करते हैं और आगे भी ऑर्डर देना चाहते हैं।`
      : `- Start politely: say you value working with ${f.supplierName} and want to keep ordering.`,
  );
  lines.push(
    hi
      ? `- बताएँ कि आप ${invoice} के बारे में बात कर रहे हैं: ${inr(f.invoiceRupees)} (${f.pairsOrdered} जोड़े), जो ${f.dueInDays} दिन में देय है।`
      : `- Say you are calling about ${invoice} for ${inr(f.invoiceRupees)} (${f.pairsOrdered} pairs), which is due in ${f.dueInDays} days.`,
  );

  if (f.payLaterRupees > 0) {
    lines.push(
      f.extraDaysRequested > 0
        ? hi
          ? `- पहले पूरी रकम चुकाने के लिए ${f.extraDaysRequested} दिन और माँगें।`
          : `- Ask first for ${f.extraDaysRequested} extra days to pay the full amount.`
        : hi
          ? "- पूरी रकम चुकाने के लिए थोड़ा और समय माँगें।"
          : "- Ask first for a little more time to pay the full amount.",
    );
    lines.push(
      hi
        ? `- अगर यह मुश्किल हो, तो ${inr(f.payOnTimeRupees)} समय पर देने और बाक़ी ${inr(f.payLaterRupees)} बाद में देने का प्रस्ताव रखें।`
        : `- If extra days are hard, offer to pay ${inr(f.payOnTimeRupees)} on time and the remaining ${inr(f.payLaterRupees)} afterwards.`,
    );
  } else {
    lines.push(
      hi
        ? "- कहें कि आप पूरी रकम समय पर चुका देंगे और बस तारीख़ की पुष्टि करना चाहते हैं।"
        : "- Say you expect to pay in full on time and just want to confirm the due date.",
    );
  }
  lines.push(
    hi
      ? "- धन्यवाद दें, साफ़ तारीख़ तय करें, और बातचीत के बाद उसे संदेश या ईमेल में लिखकर पक्का करें।"
      : "- Thank them, agree on a clear date, and confirm it in writing (message or email) after the call.",
  );
  return lines.join("\n");
}

/** One plain sentence on how the plan did (two if it left part of the real need uncovered). Same facts in both languages. */
export function templateSummary(f: ResultsFacts, language: Language): string {
  const hi = language === "hi";
  const money = hi
    ? f.moneyDirection === "saved"
      ? `आम तरीके से उधार लेने की तुलना में आपने ${inr(f.moneySavedRupees)} बचाए`
      : f.moneyDirection === "cost more"
        ? `आम तरीके से उधार लेने के मुक़ाबले प्लान पर ${inr(f.moneySavedRupees)} ज़्यादा खर्च आया`
        : "प्लान का खर्च आम तरीके से उधार लेने जितना ही रहा"
    : f.moneyDirection === "saved"
      ? `You saved ${inr(f.moneySavedRupees)} compared with the usual way of borrowing`
      : f.moneyDirection === "cost more"
        ? `The plan cost ${inr(f.moneySavedRupees)} more than the usual way of borrowing`
        : "The plan cost the same as the usual way of borrowing";
  const sales = hi
    ? f.salesDirection === "in line"
      ? "बिक्री अनुमान के मुताबिक रही"
      : `बिक्री अनुमान से ${f.salesVsForecastPercent}% ${f.salesDirection === "below" ? "कम" : "ज़्यादा"} रही`
    : f.salesDirection === "in line"
      ? "sales came in as forecast"
      : `sales came in ${f.salesVsForecastPercent}% ${f.salesDirection} forecast`;
  const stock = hi
    ? f.pairsLeftOver > 0
      ? `${f.pairsOrdered} में से ${f.pairsLeftOver} जोड़ी बच गईं`
      : `सभी ${f.pairsOrdered} जोड़ी बिक गईं`
    : f.pairsLeftOver > 0
      ? `${f.pairsLeftOver} of ${f.pairsOrdered} pairs were left over`
      : `all ${f.pairsOrdered} pairs sold`;
  const main = hi ? `${money}; ${sales} और ${stock}।` : `${money}; ${sales} and ${stock}.`;
  if (f.drawnFromStandbyRupees <= 0 && f.beyondStandbyRupees <= 0) return main;
  let warn = "";
  if (f.drawnFromStandbyRupees > 0) {
    warn += hi
      ? ` प्लान के बाद ज़रूरी बची नकदी में से ${inr(f.drawnFromStandbyRupees)} बैकअप (न निकाली गई क्रेडिट लिमिट) से निकालने पड़ते।`
      : ` ${inr(f.drawnFromStandbyRupees)} of the extra cash needed would have been drawn from your backup (your unused credit limit).`;
  }
  if (f.beyondStandbyRupees > 0) {
    warn += hi
      ? ` ${inr(f.beyondStandbyRupees)} बैकअप से भी ज़्यादा था।`
      : ` A further ${inr(f.beyondStandbyRupees)} was more than your backup could cover.`;
  }
  return main + warn;
}
