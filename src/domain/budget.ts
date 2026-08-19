import { format, parseISO } from 'date-fns';
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

function transactionMonth(dateIso: string): string {
  return format(parseISO(dateIso), 'yyyy-MM');
}

function categoryAmountsInTransaction(tx: Transaction): { categoryId: string; amount: number }[] {
  if (tx.splits && tx.splits.length > 0) return tx.splits;
  if (tx.categoryId) return [{ categoryId: tx.categoryId, amount: tx.amount }];
  return [];
}

export function categoryActivityThroughMonth(transactions: Transaction[], categoryId: string, month: string): number {
  return transactions
    .filter((tx) => !tx.deleted && !tx.transferId && transactionMonth(tx.date) <= month)
    .flatMap(categoryAmountsInTransaction)
    .filter((entry) => entry.categoryId === categoryId)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

export function categoryActivityInMonth(transactions: Transaction[], categoryId: string, month: string): number {
  return transactions
    .filter((tx) => !tx.deleted && !tx.transferId && transactionMonth(tx.date) === month)
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
    .filter((tx) => !tx.deleted && !tx.transferId && transactionMonth(tx.date) <= month)
    .flatMap(categoryAmountsInTransaction)
    .filter((entry) => incomeCategoryIds.has(entry.categoryId))
    .reduce((sum, entry) => sum + entry.amount, 0);

  const totalAssigned = budgets.filter((entry) => entry.month <= month).reduce((sum, entry) => sum + entry.assigned, 0);

  return openingBalances + incomeThroughMonth - totalAssigned;
}

export type CategoryBudgetSummary = {
  category: Category;
  assigned: number;
  activity: number;
  available: number;
};

export function summarizeCategory(
  category: Category,
  budgets: BudgetEntry[],
  transactions: Transaction[],
  month: string,
): CategoryBudgetSummary {
  return {
    category,
    assigned: categoryAssignedInMonth(budgets, category.id, month),
    activity: categoryActivityInMonth(transactions, category.id, month),
    available: categoryAvailable(budgets, transactions, category.id, month),
  };
}
