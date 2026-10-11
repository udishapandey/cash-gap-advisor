// Plain-text templates, in English and Hindi. Used three ways:
//   1. as the mock "AI" answer when AI_MOCK=true,
//   2. as the fallback shown when the AI is unavailable or its text fails the grounding check,
//   3. as a baseline the tests compare against.
// Every number comes straight from the facts. Nothing is calculated here. (The Hindi wording was drafted
// by an AI assistant: have a native speaker review it before real use.)

import type { ExplainFacts, ScriptFacts, StepFacts } from "./ai-facts";
import { formatINR } from "./format";
import type { Language } from "./language";

const inr = formatINR;

function stepText(step: StepFacts, lang: Language): string {
  if (lang === "hi") {
    switch (step.source) {
      case "early settlement":
        return `अपनी ${inr(step.amountRupees)} की बिक्री का पैसा जल्दी निकालें`;
      case "credit line":
        return `क्रेडिट लाइन से ${inr(step.amountRupees)} लें`;
      case "bank overdraft":
        return `अपने बैंक ओवरड्राफ्ट से ${inr(step.amountRupees)} निकालें`;
      default:
        return `कुछ जोड़े बाद में डिलीवर करवाएँ (${inr(step.amountRupees)} अभी बचेंगे)`;
    }
  }
  switch (step.source) {
    case "early settlement":
      return `settle ${inr(step.amountRupees)} of your own sales early`;
    case "credit line":
      return `borrow ${inr(step.amountRupees)} on the credit line`;
    case "bank overdraft":
      return `draw ${inr(step.amountRupees)} from your bank overdraft`;
    default:
      return `have some pairs delivered later (${inr(step.amountRupees)} freed now)`;
  }
}

/** 3 to 4 plain sentences: what to do, why it is cheapest, the main risk. */
export function templateExplanation(facts: ExplainFacts, language: Language): string {
  const hi = language === "hi";
  const rightSized = facts.recommendedPlan === "right_sized";
  const v = rightSized ? facts.rightSized : facts.keepFull;
  const other = rightSized ? facts.keepFull : facts.rightSized;
  const r = facts.ratesPercent;

  // 1. What to do.
  const doing: string[] = [];
  if (rightSized && v.pairs < facts.pairsOrdered) {
    doing.push(hi ? `अभी ${facts.pairsOrdered} में से ${v.pairs} जोड़े का ऑर्डर दें` : `order ${v.pairs} of ${facts.pairsOrdered} pairs now`);
  }
  if (v.paysEarlyForDiscount) {
    doing.push(
      hi
        ? `${v.earlyPaymentDiscountPercent}% छूट के लिए दिन ${v.payByDay} तक सप्लायर को भुगतान करें`
        : `pay the supplier by day ${v.payByDay} for the ${v.earlyPaymentDiscountPercent}% discount`,
    );
  }
  for (const s of v.steps) doing.push(stepText(s, language));
  const doingText = doing.length ? doing.join(hi ? ", फिर " : ", then ") : "";
  const noBorrowing = hi
    ? "आपको कर्ज़ लेने की ज़रूरत नहीं है: आपका कैश इनवॉइस के लिए काफ़ी है।"
    : "You do not need to borrow: your cash covers the invoice.";
  const todo = doing.length > 0 ? (hi ? `क्या करें: ${doingText}।` : `Here is what to do: ${doingText}.`) : "";
  // No funding step means no borrowing at all: say so plainly, whether or not there is something else to do.
  const s1 = v.steps.length === 0 ? [todo, noBorrowing].filter(Boolean).join(" ") : todo;

  // 2. Why it is the cheapest.
  let s2 = "";
  if (v.peakShortfallRupees > 0) {
    s2 = hi
      ? `यह सबसे सस्ता तरीका है: सबसे बुरे दिन की कमी ${inr(v.peakShortfallRupees)} को पूरा करने में कुल खर्च ${inr(v.fundingCostRupees)} आता है, क्योंकि अर्ली सेटलमेंट सिर्फ ${r.earlySettlementFeePercent}% है (लगभग ${r.earlySettlementAnnualisedPercent}% सालाना), जबकि क्रेडिट लाइन ${r.creditLineAnnualPercent}% सालाना है।`
      : `It is the cheapest way to cover the worst-day shortfall of ${inr(v.peakShortfallRupees)}: it costs ${inr(v.fundingCostRupees)} in all, because early settlement is only ${r.earlySettlementFeePercent}% (about ${r.earlySettlementAnnualisedPercent}% a year) while the credit line is ${r.creditLineAnnualPercent}% a year.`;
    if (other.loanRupees !== v.loanRupees) {
      s2 += hi
        ? ` दूसरे प्लान में ${inr(other.loanRupees)} का कर्ज़ लेना पड़ेगा।`
        : ` The other plan would need ${inr(other.loanRupees)} of loans.`;
    }
  }

  // 3. The main risk, including unsold stock.
  const unsold = facts.stock.unsoldPairsIfFullOrder;
  const pct = facts.stock.unsoldIfFullOrderPercent;
  let s3: string;
  if (rightSized) {
    s3 = hi
      ? `मुख्य जोखिम: कम जोड़े मँगाने पर अगर बिक्री अनुमान से ज़्यादा हुई तो स्टॉक कम पड़ सकता है; पूरा ऑर्डर रखने पर लगभग ${unsold} जोड़े (${pct}%) बिना बिके रह सकते हैं।`
      : `The main risk: ordering fewer pairs means you could run short of stock if sales beat the forecast, but if you keep the full order about ${unsold} pairs (${pct}%) may stay unsold.`;
  } else if (unsold > 0) {
    s3 = hi
      ? `मुख्य जोखिम बिना बिका स्टॉक है: अगर बिक्री कम रही तो लगभग ${unsold} जोड़े (${pct}%) बिना बिके रह सकते हैं।`
      : `The main risk is unsold stock: about ${unsold} pairs (${pct}%) may stay unsold if sales fall short.`;
  } else {
    s3 = hi
      ? "मुख्य जोखिम यह है कि बिक्री अनुमान से कम रहे, जिससे आपको और कर्ज़ लेना पड़ सकता है।"
      : "The main risk is that sales fall below the forecast, which would raise the amount you need to borrow.";
  }

  const extras: string[] = [];
  if (!v.fullyCovered) {
    extras.push(
      hi
        ? `चेतावनी: यह प्लान कमी का ${inr(v.uncoveredRupees)} पूरा नहीं करता।`
        : `Warning: this plan leaves ${inr(v.uncoveredRupees)} of the shortfall uncovered.`,
    );
  }
  if (facts.lowConfidenceForecast) {
    extras.push(
      hi
        ? "बिक्री का अनुमान अनिश्चित है, इसलिए मंज़ूरी से पहले संख्याएँ दोबारा देख लें।"
        : "The forecast is uncertain, so check the numbers again before you approve.",
    );
  }
  return [s1, s2, s3, ...extras].filter(Boolean).join(" ");
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
