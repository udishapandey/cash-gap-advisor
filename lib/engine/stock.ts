// Stock maths: how many pairs will sell, what ordering fewer costs, and how big the order should be.
// Plain TypeScript, no AI. All amounts in ₹.

import { CONFIG, type Scenario } from "./config";
import type { Merchant } from "../data/merchant";
import type { Invoice } from "../data/invoice";

const clampDrop = (d: number) => Math.min(100, Math.max(0, d));

/** Gross margin on one pair: selling price × margin %. */
export function marginPerPair(): number {
  return (CONFIG.stock.sellingPricePerPair * CONFIG.stock.grossMarginPct) / 100;
}

/**
 * Pairs forecast to sell this season. Last Diwali's units, scaled by how this scenario's
 * festive uplift compares with last year's, then reduced by the what-if sales drop.
 */
export function demandUnits(merchant: Merchant, scenario: Scenario, salesDropPercent = 0): number {
  const upliftRatio = CONFIG.scenarioUplift[scenario] / merchant.lastYearFestive.uplift;
  return CONFIG.stock.lastDiwaliUnitsSold * upliftRatio * (1 - clampDrop(salesDropPercent) / 100);
}

export interface StockOutRisk {
  unitsNotOrdered: number;
  /** Share of the pairs not ordered that the forecast says would have sold. */
  probabilitySell: number;
  marginPerUnit: number;
  /** pairs not ordered × probability they would sell × margin per pair */
  expectedLostMargin: number;
}

/**
 * Expected lost gross margin from leaving `unitsNotOrdered` pairs off an order of `orderUnits`.
 * The pairs left off are the last ones. Pair number k sells if forecast demand reaches k,
 * so the pairs that would sell are those between (order - not ordered) and the demand.
 */
export function expectedLostMargin(args: {
  orderUnits: number;
  unitsNotOrdered: number;
  demandUnits: number;
}): StockOutRisk {
  const { orderUnits, unitsNotOrdered, demandUnits: demand } = args;
  const wouldSell = Math.min(
    unitsNotOrdered,
    Math.max(0, Math.min(orderUnits, demand) - (orderUnits - unitsNotOrdered)),
  );
  const probabilitySell = unitsNotOrdered > 0 ? wouldSell / unitsNotOrdered : 0;
  const marginPerUnit = marginPerPair();
  return {
    unitsNotOrdered,
    probabilitySell,
    marginPerUnit,
    expectedLostMargin: Math.round(unitsNotOrdered * probabilitySell * marginPerUnit),
  };
}

export interface RightSizing {
  fullUnits: number;
  /** Forecast pairs sold this season in each scenario, after the what-if drop. */
  demandByScenario: Record<Scenario, number>;
  /** The scenario the order is sized for. */
  basis: Scenario;
  recommendedUnits: number;
  unitsCut: number;
  unsoldShare: number; // share of the full order expected to stay unsold
  cashSaved: number; // ₹ not paid to the supplier
  /** Recommend the right-sized order when expected unsold stock is over the threshold. */
  recommend: boolean;
}

/** Order the pairs the forecast says will sell, never more than the invoice quantity. */
export function rightSize(
  invoice: Invoice,
  merchant: Merchant,
  basis: Scenario,
  salesDropPercent = 0,
): RightSizing {
  const demandByScenario = {
    low: demandUnits(merchant, "low", salesDropPercent),
    expected: demandUnits(merchant, "expected", salesDropPercent),
    high: demandUnits(merchant, "high", salesDropPercent),
  };
  const recommendedUnits = Math.min(invoice.units, Math.floor(demandByScenario[basis]));
  const unitsCut = invoice.units - recommendedUnits;
  const unsoldShare = unitsCut / invoice.units;
  return {
    fullUnits: invoice.units,
    demandByScenario,
    basis,
    recommendedUnits,
    unitsCut,
    unsoldShare,
    cashSaved: unitsCut * invoice.unitPrice,
    recommend: unsoldShare > CONFIG.rightSizeUnsoldThreshold,
  };
}

/** The same invoice for a different number of pairs. */
export function withUnits(invoice: Invoice, units: number): Invoice {
  return { ...invoice, units, amount: units * invoice.unitPrice };
}
