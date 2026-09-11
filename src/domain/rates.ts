import type { Rate } from '@/db/types';

/**
 * quote-currency code -> how many units of the base currency one unit is worth.
 * The base currency itself is always 1.
 */
export type RateTable = ReadonlyMap<string, number>;

export function buildRateTable(rates: Rate[], base: string): RateTable {
  const table = new Map<string, number>([[base, 1]]);
  for (const rate of rates) {
    if (rate.base !== base) continue;
    if (!Number.isFinite(rate.rate) || rate.rate <= 0) continue;
    table.set(rate.quote, rate.rate);
  }
  return table;
}

export function rateId(base: string, quote: string): string {
  return `${base}:${quote}`;
}

/**
 * Rate to use for an amount in `currency`, or undefined when unknown.
 *
 * Undefined is deliberately distinguishable from 1: callers must be able to
 * tell "no conversion needed" from "cannot convert", so a missing rate is
 * never silently treated as parity.
 */
export function rateFor(table: RateTable, currency: string): number | undefined {
  return table.get(currency);
}

/** Converts a minor-unit amount into base currency, or undefined if unknown. */
export function toBase(amountMinor: number, currency: string, table: RateTable): number | undefined {
  const rate = rateFor(table, currency);
  return rate === undefined ? undefined : Math.round(amountMinor * rate);
}

export type ConversionSummary = {
  total: number;
  /** Currencies present that had no rate; their amounts are excluded. */
  missing: string[];
};

/**
 * Sums mixed-currency amounts into the base currency, reporting anything it
 * could not convert rather than quietly dropping or mis-adding it.
 */
export function sumInBase(
  entries: readonly { amountMinor: number; currency: string }[],
  table: RateTable,
): ConversionSummary {
  let total = 0;
  const missing = new Set<string>();
  for (const entry of entries) {
    const converted = toBase(entry.amountMinor, entry.currency, table);
    if (converted === undefined) missing.add(entry.currency);
    else total += converted;
  }
  return { total, missing: [...missing] };
}
