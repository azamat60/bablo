import { DEFAULT_ICON_KEY } from '@/lib/icons';
import { amountInBase, categoryAmountsInTransaction, countsTowardBudget } from './budget';
import type { Category, CategoryGroup, Transaction } from '@/db/types';

/**
 * Maps every category to the group that owns it.
 *
 * Transactions reference a category, but the dashboard aggregates by group, so
 * almost every rollup needs this lookup.
 */
export function buildCategoryGroupIndex(categories: Category[]): ReadonlyMap<string, string> {
  return new Map(categories.map((category) => [category.id, category.groupId]));
}

/**
 * Groups gained an optional icon only with the tile dashboard, so every group
 * created before that has none. Rather than backfilling the database we fall
 * back to the first live child's icon, which is what the group looked like when
 * it was rendered as a list of its categories.
 */
export function groupIcon(group: CategoryGroup, children: Category[]): string {
  if (group.icon) return group.icon;
  const firstActive = children.find((category) => !category.archived);
  return firstActive?.icon ?? DEFAULT_ICON_KEY;
}

export type GroupActivity = {
  /** Signed total for the group over the given transactions. */
  amount: number;
  /** Number of contributing transactions, for empty-state decisions. */
  count: number;
};

/**
 * Totals every group in one pass. Callers pass transactions already narrowed to
 * the period they care about.
 */
export function groupActivity(
  transactions: Transaction[],
  categoryGroupIndex: ReadonlyMap<string, string>,
): ReadonlyMap<string, GroupActivity> {
  const totals = new Map<string, GroupActivity>();

  for (const tx of transactions) {
    if (!countsTowardBudget(tx)) continue;
    for (const entry of categoryAmountsInTransaction(tx)) {
      const groupId = categoryGroupIndex.get(entry.categoryId);
      if (!groupId) continue;
      // Group totals are shown in the base currency, so convert here.
      const amount = amountInBase(tx, entry.amount);
      const current = totals.get(groupId);
      if (current) {
        current.amount += amount;
        current.count += 1;
      } else {
        totals.set(groupId, { amount, count: 1 });
      }
    }
  }

  return totals;
}

export const EMPTY_GROUP_ACTIVITY: GroupActivity = { amount: 0, count: 0 };
