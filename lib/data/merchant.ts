// SIMULATED DATA. "Rahul's shoe brand" is a made-up merchant.
// None of these numbers come from Razorpay or any real business.
// Every value is documented in docs/ASSUMPTIONS.md.

export const SIMULATED_LABEL = "Simulated data";

/** Orders placed on one day. `day` counts from today: 0 = today, -1 = yesterday, ... */
export interface DailyOrders {
  day: number;
  date: string; // YYYY-MM-DD
  orders: number;
  prepaidValue: number; // ₹ of prepaid (UPI / card) orders
  codValue: number; // ₹ of cash-on-delivery orders
}

export interface Merchant {
  simulated: true;
  name: string;
  today: string;
  bankBalance: number;
  settlementDays: number; // prepaid money reaches the bank on day T+N
  codPayoutDelayDays: { min: number; max: number }; // COD cash reaches the bank this many days after the order
  codReturnRate: number; // share of COD orders returned (RTO); that cash never arrives
  otherOutflowsPerDay: number; // ads, courier, salaries, rent, GST, other suppliers
  creditLineLimit: number; // pre-approved credit line on offer
  overdraftLimit: number; // the founder's own bank overdraft
  lastYearFestive: {
    period: string;
    baselineDailySales: number;
    festiveDailySales: number;
    uplift: number;
  };
  dailyOrders: DailyOrders[];
}

const TODAY = "2026-10-10";
const HISTORY_DAYS = 90;
const BASE_ORDERS_PER_DAY = 50;
const AVERAGE_ORDER_VALUE = 2000; // ₹ per pair of shoes
export const PREPAID_SHARE = 0.55; // COD is about 45% of orders

// Small seeded random generator so the "random" history is identical on every run.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dateOffset(base: string, days: number): { date: string; weekday: number } {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return { date: d.toISOString().slice(0, 10), weekday: d.getUTCDay() };
}

function buildDailyOrders(): DailyOrders[] {
  const random = mulberry32(2026);
  const rows: DailyOrders[] = [];
  for (let day = -(HISTORY_DAYS - 1); day <= 0; day++) {
    const { date, weekday } = dateOffset(TODAY, day);
    const weekendBoost = weekday === 0 || weekday === 6 ? 1.12 : 0.96;
    const noise = 1 + (random() - 0.5) * 0.24; // ±12%
    const orders = Math.round(BASE_ORDERS_PER_DAY * weekendBoost * noise);
    const prepaidOrders = Math.round(orders * PREPAID_SHARE);
    rows.push({
      day,
      date,
      orders,
      prepaidValue: prepaidOrders * AVERAGE_ORDER_VALUE,
      codValue: (orders - prepaidOrders) * AVERAGE_ORDER_VALUE,
    });
  }
  return rows;
}

export const merchant: Merchant = {
  simulated: true,
  name: "Rahul's shoe brand",
  today: TODAY,
  bankBalance: 150_000,
  settlementDays: 2,
  codPayoutDelayDays: { min: 12, max: 13 }, // about 4 days to deliver, then 8 to 9 days for the courier to remit
  codReturnRate: 0.3, // returns to origin for footwear
  // CALIBRATED, not observed: chosen so the expected gap on the discount deadline is about ₹2.3L, matching the demo story.
  // Without other outflows this merchant would have a ₹8L surplus and no gap to solve.
  otherOutflowsPerDay: 90_000,
  creditLineLimit: 300_000,
  overdraftLimit: 100_000,
  lastYearFestive: {
    period: "Diwali 2025, the 14 days before the festival",
    baselineDailySales: 100_000,
    festiveDailySales: 140_000,
    uplift: 1.4,
  },
  dailyOrders: buildDailyOrders(),
};
