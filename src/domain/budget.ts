import { format } from 'date-fns';
import { getDateFnsLocale } from '@/i18n/dateFnsLocale';
import type { Account, BudgetEntry, Category, CategoryGroup, Transaction } from '@/db/types';

export function monthKey(date: Date = new Date()): string {
  return format(date, 'yyyy-MM');
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNum] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year!, monthNum! - 1 + delta, 1));
  return format(date, 'yyyy-MM');
}

export function monthLabel(month: string): string {
  const [year, monthNum] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year!, monthNum! - 1, 1));
  return format(date, 'MMMM yyyy', { locale: getDateFnsLocale() });
}

/**
 * Transaction dates are always stored as 'yyyy-MM-dd', so the month is a plain
 * prefix. Slicing avoids a parseISO + format round trip per transaction, which
 * matters because these helpers run over the whole table.
 */
function transactionMonth(dateIso: string): string {
  return dateIso.slice(0, 7);
}

/**
 * A transaction contributes to one category, or to several when it is split.
 * Shared with the suggestion engine, which needs the same fan-out.
 */
export function categoryAmountsInTransaction(tx: Transaction): { categoryId: string; amount: number }[] {
  if (tx.splits && tx.splits.length > 0) return tx.splits;
  if (tx.categoryId) return [{ categoryId: tx.categoryId, amount: tx.amount }];
  return [];
}

export function countsTowardBudget(tx: Transaction): boolean {
  return !tx.deleted && !tx.transferId;
}

/**
 * Converts one of a transaction's amounts into the base currency using the
 * rate stamped on it at write time.
 *
 * Rows written before multi-currency support carry rate 1, which is correct
 * for base-currency transactions and leaves their figures untouched.
 */
export function amountInBase(tx: Transaction, amount: number): number {
  const rate = Number.isFinite(tx.rate) && tx.rate > 0 ? tx.rate : 1;
  return rate === 1 ? amount : Math.round(amount * rate);
}

export function categoryActivityThroughMonth(transactions: Transaction[], categoryId: string, month: string): number {
  return transactions
    .filter((tx) => countsTowardBudget(tx) && transactionMonth(tx.date) <= month)
    .flatMap(categoryAmountsInTransaction)
    .filter((entry) => entry.categoryId === categoryId)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

export function categoryActivityInMonth(transactions: Transaction[], categoryId: string, month: string): number {
  return transactions
    .filter((tx) => countsTowardBudget(tx) && transactionMonth(tx.date) === month)
    .flatMap(categoryAmountsInTransaction)
    .filter((entry) => entry.categoryId === categoryId)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

export function categoryAssignedThroughMonth(budgets: BudgetEntry[], categoryId: string, month: string): number {
  return budgets
    .filter((entry) => entry.categoryId === categoryId && entry.month <= month)
    .reduce((sum, entry) => sum + entry.assigned, 0);
}

export function categoryAssignedInMonth(budgets: BudgetEntry[], categoryId: string, month: string): number {
  return budgets.find((entry) => entry.categoryId === categoryId && entry.month === month)?.assigned ?? 0;
}

export function categoryAvailable(
  budgets: BudgetEntry[],
  transactions: Transaction[],
  categoryId: string,
  month: string,
): number {
  return (
    categoryAssignedThroughMonth(budgets, categoryId, month) +
    categoryActivityThroughMonth(transactions, categoryId, month)
  );
}

export function readyToAssign(
  accounts: Account[],
  categoryGroups: CategoryGroup[],
  categories: Category[],
  budgets: BudgetEntry[],
  transactions: Transaction[],
  month: string,
): number {
  const incomeGroupIds = new Set(categoryGroups.filter((g) => g.kind === 'income').map((g) => g.id));
  const incomeCategoryIds = new Set(categories.filter((c) => incomeGroupIds.has(c.groupId)).map((c) => c.id));
  const openingBalances = accounts.reduce((sum, account) => sum + account.openingBalance, 0);

  const incomeThroughMonth = transactions
    .filter((tx) => countsTowardBudget(tx) && transactionMonth(tx.date) <= month)
    .flatMap(categoryAmountsInTransaction)
    .filter((entry) => incomeCategoryIds.has(entry.categoryId))
    .reduce((sum, entry) => sum + entry.amount, 0);

  const totalAssigned = budgets.filter((entry) => entry.month <= month).reduce((sum, entry) => sum + entry.assigned, 0);

  return openingBalances + incomeThroughMonth - totalAssigned;
}

export type CategoryBudgetTotals = {
  /** Assigned in this month alone. */
  assigned: number;
  /** Signed activity in this month alone (expenses are negative). */
  activity: number;
  /** Envelope balance: everything assigned through this month plus all activity through it. */
  available: number;
};

export const EMPTY_CATEGORY_TOTALS: CategoryBudgetTotals = { assigned: 0, activity: 0, available: 0 };

export type MonthBudgetIndex = ReadonlyMap<string, CategoryBudgetTotals>;

/**
 * Computes every category's month totals in a single pass over budgets and
 * transactions.
 *
 * The per-category helpers above each re-scan the full transaction list, so
 * summarising N categories one by one costs N*3 full scans. Callers that need
 * more than one category should build this index once and read from it.
 */
export function buildMonthBudgetIndex(
  budgets: BudgetEntry[],
  transactions: Transaction[],
  month: string,
): MonthBudgetIndex {
  const assignedIn = new Map<string, number>();
  const assignedThrough = new Map<string, number>();
  const activityIn = new Map<string, number>();
  const activityThrough = new Map<string, number>();

  const bump = (map: Map<string, number>, key: string, delta: number) => {
    map.set(key, (map.get(key) ?? 0) + delta);
  };

  for (const entry of budgets) {
    if (entry.month > month) continue;
    bump(assignedThrough, entry.categoryId, entry.assigned);
    if (entry.month === month) bump(assignedIn, entry.categoryId, entry.assigned);
  }

  for (const tx of transactions) {
    if (!countsTowardBudget(tx)) continue;
    const txMonth = transactionMonth(tx.date);
    if (txMonth > month) continue;
    const isCurrentMonth = txMonth === month;
    for (const entry of categoryAmountsInTransaction(tx)) {
      const amount = amountInBase(tx, entry.amount);
      bump(activityThrough, entry.categoryId, amount);
      if (isCurrentMonth) bump(activityIn, entry.categoryId, amount);
    }
  }

  const index = new Map<string, CategoryBudgetTotals>();
  const categoryIds = new Set([...assignedThrough.keys(), ...activityThrough.keys()]);
  for (const categoryId of categoryIds) {
    index.set(categoryId, {
      assigned: assignedIn.get(categoryId) ?? 0,
      activity: activityIn.get(categoryId) ?? 0,
      available: (assignedThrough.get(categoryId) ?? 0) + (activityThrough.get(categoryId) ?? 0),
    });
  }
  return index;
}

export function categoryTotals(index: MonthBudgetIndex, categoryId: string): CategoryBudgetTotals {
  return index.get(categoryId) ?? EMPTY_CATEGORY_TOTALS;
}

export type CategoryBudgetSummary = CategoryBudgetTotals & {
  category: Category;
};

export function summarizeCategoryFrom(index: MonthBudgetIndex, category: Category): CategoryBudgetSummary {
  return { category, ...categoryTotals(index, category.id) };
}

export function summarizeCategory(
  category: Category,
  budgets: BudgetEntry[],
  transactions: Transaction[],
  month: string,
): CategoryBudgetSummary {
  return summarizeCategoryFrom(buildMonthBudgetIndex(budgets, transactions, month), category);
}

export type GroupBudgetSummary = CategoryBudgetTotals & {
  /** Per-child summaries, in the order the categories were given. */
  categories: CategoryBudgetSummary[];
  /** True when the group has any assignment or activity this month. */
  hasData: boolean;
};

/**
 * Rolls a group's children up into the single pair of numbers a dashboard tile
 * shows. Budgets are stored per category, never per group, so this is the only
 * correct way to get a group-level budget figure.
 */
export function summarizeGroup(index: MonthBudgetIndex, categories: Category[]): GroupBudgetSummary {
  const summaries = categories.map((category) => summarizeCategoryFrom(index, category));
  return {
    categories: summaries,
    assigned: summaries.reduce((sum, s) => sum + s.assigned, 0),
    activity: summaries.reduce((sum, s) => sum + s.activity, 0),
    available: summaries.reduce((sum, s) => sum + s.available, 0),
    hasData: summaries.some((s) => s.assigned !== 0 || s.activity !== 0),
  };
}
