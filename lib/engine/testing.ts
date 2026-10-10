// Test helper: a merchant whose sales are identical every day, so results can be checked by hand.
// Not used by the app.

import { merchant, type Merchant } from "../data/merchant";

export function flatMerchant(overrides: Partial<Merchant> = {}): Merchant {
  const dailyOrders = Array.from({ length: 60 }, (_, i) => ({
    day: -59 + i,
    date: "test",
    orders: 50,
    prepaidValue: 60_000,
    codValue: 40_000,
  }));
  return {
    ...merchant,
    bankBalance: 100_000,
    otherOutflowsPerDay: 100_000,
    dailyOrders,
    ...overrides,
  };
}
