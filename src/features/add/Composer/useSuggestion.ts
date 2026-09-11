import { useMemo } from 'react';
import { useSuggestionSource } from '@/db/queries/suggest';
import { suggestForGroup, type Suggestion } from '@/domain/suggest';
import { todayIsoDate } from '@/domain/transactions';
import type { Category } from '@/db/types';

export type UseSuggestionInput = {
  enabled: boolean;
  categories: Category[];
  accountId?: string;
  direction: 'expense' | 'income';
  memo?: string;
};

/**
 * Runs the local suggestion engine for the group currently chosen in the
 * composer. Synchronous by design — the chip must be on screen in the same
 * frame the composer paints, so there is no network round trip here.
 */
export function useSuggestion({
  enabled,
  categories,
  accountId,
  direction,
  memo,
}: UseSuggestionInput): Suggestion | null {
  const source = useSuggestionSource(enabled);

  return useMemo(() => {
    if (!enabled || !accountId || categories.length === 0) return null;
    return suggestForGroup({
      transactions: source.transactions,
      categories,
      accountId,
      recurring: source.recurring,
      payees: source.payees,
      memo,
      today: todayIsoDate(),
      direction,
    });
  }, [enabled, source, categories, accountId, direction, memo]);
}
