import { useLiveQuery } from 'dexie-react-hooks';
import { format, subDays } from 'date-fns';
import { db } from '@/db/db';
import { LOOKBACK_DAYS } from '@/domain/suggest.constants';
import type { Payee, Recurring, Transaction } from '@/db/types';

export type SuggestionSource = {
  transactions: Transaction[];
  payees: Payee[];
  recurring: Recurring[];
};

const EMPTY: SuggestionSource = { transactions: [], payees: [], recurring: [] };

/**
 * Everything the suggestion engine reads, in one live query.
 *
 * Uses the `date` index rather than `useTransactions()`, which loads the whole
 * table: the engine only ever looks back LOOKBACK_DAYS, so this is a range
 * scan over a few hundred rows.
 */
export function useSuggestionSource(enabled = true): SuggestionSource {
  return (
    useLiveQuery(async () => {
      if (!enabled) return EMPTY;
      const cutoff = format(subDays(new Date(), LOOKBACK_DAYS), 'yyyy-MM-dd');
      const [transactions, payees, recurring] = await Promise.all([
        db.transactions.where('date').aboveOrEqual(cutoff).toArray(),
        db.payees.toArray(),
        db.recurring.toArray(),
      ]);
      return { transactions, payees, recurring };
    }, [enabled]) ?? EMPTY
  );
}
