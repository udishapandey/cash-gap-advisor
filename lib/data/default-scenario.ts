// The default scenario shown on Home before any bill is uploaded: the pre-read sample invoice (Shree Ganesh Footwear,
// ₹5,00,000, 2% discount in 7 days, due 21 Oct) mapped into the engine exactly as the Bill screen maps it.
// SIMULATED: a made-up supplier invoice.

import { parseConfirmed, toEngineInvoice, toFormValues } from "../invoice-extraction";
import type { Invoice } from "./invoice";
import { preReadSampleExtraction } from "./sample-extraction";

function build(): Invoice {
  const form = parseConfirmed(toFormValues(preReadSampleExtraction));
  if (!form.ok) throw new Error("The built-in sample invoice is invalid.");
  const mapped = toEngineInvoice(form.data);
  if (!mapped.ok) throw new Error(mapped.error);
  return mapped.invoice;
}

export const defaultInvoice: Invoice = build();
