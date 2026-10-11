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

const sourceName = (source: string, lang: Language): string => {
  if (lang === "hi") {
    return (
      { "early settlement": "अर्ली सेटलमेंट", "credit line": "क्रेडिट लाइन", "bank overdraft": "बैंक ओवरड्राफ्ट" } as Record<string, string>
    )[source] ?? "स्प्लिट ऑर्डर (कुछ जोड़ी बाद में)";
  }
  return source === "split order" ? "split order (some pairs delivered later)" : source;
};

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
        ? `कुल फंडिंग खर्च ${inr(v.fundingCostRupees)} है, जो दिन ${facts.dueInDays} पर भुगतान से सिर्फ़ ${inr(v.extraCostOfPayingEarlyRupees)} ज़्यादा है, और ${v.earlyPaymentDiscountPercent}% छूट से ${inr(v.earlyPaymentDiscountRupees)} बचते हैं, इसलिए जल्दी भुगतान करने से आपको ${inr(v.netSavingFromEarlyPaymentRupees)} का फ़ायदा होता है।`
        : `कुल फंडिंग खर्च ${inr(v.fundingCostRupees)} है और ${v.earlyPaymentDiscountPercent}% छूट से ${inr(v.earlyPaymentDiscountRupees)} बचते हैं, इसलिए जल्दी भुगतान करने से आपको ${inr(v.netSavingFromEarlyPaymentRupees)} का फ़ायदा होता है।`
      : v.extraCostOfPayingEarlyRupees > 0
        ? `Funding costs ${inr(v.fundingCostRupees)} in all, only ${inr(v.extraCostOfPayingEarlyRupees)} more than paying on day ${facts.dueInDays}, and the ${v.earlyPaymentDiscountPercent}% discount saves ${inr(v.earlyPaymentDiscountRupees)}, so you come out ${inr(v.netSavingFromEarlyPaymentRupees)} better off.`
        : `Funding costs ${inr(v.fundingCostRupees)} in all and the ${v.earlyPaymentDiscountPercent}% discount saves ${inr(v.earlyPaymentDiscountRupees)}, so you come out ${inr(v.netSavingFromEarlyPaymentRupees)} better off.`;
  } else if (v.peakShortfallRupees > 0) {
    // Compare what each costs for the days it is really used, never the yearly rates: a 2-day fee looks huge a year.
    whyCheapest = hi
      ? `कुल फंडिंग खर्च ${inr(v.fundingCostRupees)} है, जो आपके विकल्पों में सबसे कम है: अर्ली सेटलमेंट की ज़रूरत सिर्फ़ ${facts.earlySettlementDays} दिन है और उसकी फ़ीस ${r.earlySettlementFeePercent}% है, जबकि कर्ज़ ${facts.loanDays} दिन चलेगा और उस पर लगभग ${r.cheapestLoanCostForItsDaysPercent}% लगेगा।`
      : `Funding costs ${inr(v.fundingCostRupees)} in all, the lowest of your options: early settlement is needed for only ${facts.earlySettlementDays} days and costs ${r.earlySettlementFeePercent}%, while a loan would run ${facts.loanDays} days and cost about ${r.cheapestLoanCostForItsDaysPercent}%.`;
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
      ? `क्रेडिट लाइन से पूरी रकम निकालने की तुलना में आपने ${inr(f.moneySavedRupees)} बचाए`
      : f.moneyDirection === "cost more"
        ? `प्लान पर क्रेडिट लाइन से पूरी रकम निकालने से ${inr(f.moneySavedRupees)} ज़्यादा खर्च आया`
        : "प्लान का खर्च क्रेडिट लाइन से पूरी रकम निकालने जितना ही रहा"
    : f.moneyDirection === "saved"
      ? `You saved ${inr(f.moneySavedRupees)} compared with drawing the full amount on your credit line`
      : f.moneyDirection === "cost more"
        ? `The plan cost ${inr(f.moneySavedRupees)} more than drawing the full amount on your credit line`
        : "The plan cost the same as drawing the full amount on your credit line";
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
  if (f.uncoveredNeedRupees <= 0) return main;
  const warn = hi
    ? ` असली नकदी की ज़रूरत का ${inr(f.uncoveredNeedRupees)} प्लान में कवर नहीं था, इसलिए उतना और उधार लेना पड़ता।`
    : ` The plan left ${inr(f.uncoveredNeedRupees)} of the real cash need uncovered, so it would have needed a top-up.`;
  return main + warn;
}
