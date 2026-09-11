import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { buildRateTable, rateId, type RateTable } from '@/domain/rates';

const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

/** No key required, and it covers the currencies this app offers. */
const RATES_ENDPOINT = 'https://open.er-api.com/v6/latest';

export function useRateTable(base: string): RateTable {
  return (
    useLiveQuery(async () => {
      const rates = await db.rates.where('base').equals(base).toArray();
      return buildRateTable(rates, base);
    }, [base]) ?? buildRateTable([], base)
  );
}

export async function setManualRate(base: string, quote: string, rate: number): Promise<void> {
  if (!Number.isFinite(rate) || rate <= 0) return;
  await db.rates.put({ id: rateId(base, quote), base, quote, rate, fetchedAt: Date.now() });
}

type ErApiResponse = { result?: string; rates?: Record<string, number> };

/**
 * Refreshes rates at most once a day, and only when online.
 *
 * Results are cached in IndexedDB, so the app keeps converting with the last
 * known rates offline. Failure is silent by design: stale rates are better
 * than an error banner in an offline-first app.
 */
export async function refreshRatesIfStale(base: string): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const existing = await db.rates.where('base').equals(base).toArray();
  const newest = existing.reduce((max, rate) => Math.max(max, rate.fetchedAt), 0);
  if (Date.now() - newest < REFRESH_AFTER_MS) return;

  try {
    const response = await fetch(`${RATES_ENDPOINT}/${encodeURIComponent(base)}`);
    if (!response.ok) return;
    const payload = (await response.json()) as ErApiResponse;
    if (payload.result !== 'success' || !payload.rates) return;

    const now = Date.now();
    // The API gives "quote units per 1 base"; we store the inverse, because
    // every conversion in the app goes from a foreign amount into base.
    const rows = Object.entries(payload.rates)
      .filter(([, value]) => Number.isFinite(value) && value > 0)
      .map(([quote, value]) => ({ id: rateId(base, quote), base, quote, rate: 1 / value, fetchedAt: now }));

    await db.rates.bulkPut(rows);
  } catch {
    // Offline, blocked, or malformed: keep whatever we already had.
  }
}

/** The rate to stamp on a new transaction, so history is not rewritten later. */
export async function currentRate(base: string, currency: string): Promise<number> {
  if (currency === base) return 1;
  const row = await db.rates.get(rateId(base, currency));
  return row?.rate ?? 1;
}
