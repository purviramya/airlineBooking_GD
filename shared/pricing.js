import { TAX_RATE } from './config.js';

const round2 = (n) => Math.round(n * 100) / 100;

// legPrices: per-passenger fare of each flight in the trip (1 for one-way, 2 for return).
// Used by the browser (preview) and the server (authoritative, from DB prices).
export function calcTotals({ legPrices, passengers }) {
  const subtotal = legPrices.reduce((sum, p) => sum + p, 0) * passengers;
  const tax = subtotal * TAX_RATE;
  return { subtotal: round2(subtotal), tax: round2(tax), total: round2(subtotal + tax) };
}
