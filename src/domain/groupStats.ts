import { amountInBase, categoryAmountsInTransaction, countsTowardBudget } from './budget';
import type { Category, Transaction } from '@/db/types';

/**
 * A group's activity for one month, unsigned and in the base currency.
 * Both directions are counted so the same helpers serve income groups.
 */
export type MonthTotal = { month: string; amount: number };

export function groupTransactionsInGroup(transactions: Transaction[], categoryIds: ReadonlySet<string>): Transaction[] {
  return transactions.filter(
    (tx) => countsTowardBudget(tx) && categoryAmountsInTransaction(tx).some((e) => categoryIds.has(e.categoryId)),
  );
}

function groupAmount(tx: Transaction, categoryIds: ReadonlySet<string>): number {
  return categoryAmountsInTransaction(tx)
    .filter((entry) => categoryIds.has(entry.categoryId))
    .reduce((sum, entry) => sum + Math.abs(amountInBase(tx, entry.amount)), 0);
}

/** Totals per month for the given 'yyyy-MM' keys, in that order. */
export function monthlyTotals(
  transactions: Transaction[],
  categoryIds: ReadonlySet<string>,
  months: readonly string[],
): MonthTotal[] {
  const byMonth = new Map<string, number>(months.map((month) => [month, 0]));
  for (const tx of transactions) {
    if (!countsTowardBudget(tx)) continue;
    const month = tx.date.slice(0, 7);
    if (!byMonth.has(month)) continue;
    byMonth.set(month, (byMonth.get(month) ?? 0) + groupAmount(tx, categoryIds));
  }
  return months.map((month) => ({ month, amount: byMonth.get(month) ?? 0 }));
}

export type SubcategorySlice = {
  category: Category;
  amount: number;
  /** 0..1 of the group's total. */
  share: number;
};

/** How the group's month splits across its subcategories, largest first. */
export function subcategoryBreakdown(transactions: Transaction[], categories: Category[]): SubcategorySlice[] {
  const totals = new Map<string, number>();
  const ids = new Set(categories.map((c) => c.id));
  for (const tx of transactions) {
    if (!countsTowardBudget(tx)) continue;
    for (const entry of categoryAmountsInTransaction(tx)) {
      if (!ids.has(entry.categoryId)) continue;
      totals.set(entry.categoryId, (totals.get(entry.categoryId) ?? 0) + Math.abs(amountInBase(tx, entry.amount)));
    }
  }
  const grand = [...totals.values()].reduce((sum, v) => sum + v, 0);
  return categories
    .filter((category) => (totals.get(category.id) ?? 0) > 0)
    .map((category) => {
      const amount = totals.get(category.id) ?? 0;
      return { category, amount, share: grand > 0 ? amount / grand : 0 };
    })
    .sort((a, b) => b.amount - a.amount);
}

/** Percentage change from previous to current; null when there is no baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/**
 * Average per day. For the current month this divides by the days elapsed so
 * far, which is what "how fast am I spending" actually means; for a past month
 * it divides by the month's length.
 */
export function perDay(total: number, month: string, todayIso: string): number {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y!, m, 0)).getUTCDate();
  const isCurrent = todayIso.slice(0, 7) === month;
  const days = isCurrent ? Math.max(1, Number(todayIso.slice(8, 10))) : daysInMonth;
  return Math.round(total / days);
}
