import { format, parseISO } from 'date-fns';
import { getDict } from '@/i18n';
import type { Account, Category, Payee, Transaction } from '@/db/types';
import { shiftMonth } from './budget';
import { periodRange, type Period } from './period';

function transactionMonth(dateIso: string): string {
  return format(parseISO(dateIso), 'yyyy-MM');
}

function inMonth(transactions: Transaction[], month: string): Transaction[] {
  return transactions.filter((tx) => !tx.deleted && !tx.transferId && transactionMonth(tx.date) === month);
}

function inRange(transactions: Transaction[], period: Period): Transaction[] {
  const { from, to } = periodRange(period);
  return transactions.filter((tx) => {
    if (tx.deleted || tx.transferId) return false;
    const date = parseISO(tx.date);
    return date >= from && date <= to;
  });
}

export type CategorySlice = { categoryId: string; name: string; icon: string; color: string; amount: number };

function sliceByCategory(transactions: Transaction[], categories: Category[]): CategorySlice[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, number>();

  for (const tx of transactions) {
    const entries =
      tx.splits && tx.splits.length > 0
        ? tx.splits
        : tx.categoryId
          ? [{ categoryId: tx.categoryId, amount: tx.amount }]
          : [];
    for (const entry of entries) {
      if (entry.amount >= 0) continue;
      totals.set(entry.categoryId, (totals.get(entry.categoryId) ?? 0) + Math.abs(entry.amount));
    }
  }

  return Array.from(totals.entries())
    .map(([categoryId, amount]) => {
      const category = categoryById.get(categoryId);
      return {
        categoryId,
        name: category?.name ?? getDict().reportsDomain.uncategorized,
        icon: category?.icon ?? 'help-circle',
        color: category?.color ?? '#8b98a9',
        amount,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

export function expenseByCategory(transactions: Transaction[], categories: Category[], month: string): CategorySlice[] {
  return sliceByCategory(inMonth(transactions, month), categories);
}

export function expenseByCategoryInRange(
  transactions: Transaction[],
  categories: Category[],
  period: Period,
): CategorySlice[] {
  return sliceByCategory(inRange(transactions, period), categories);
}

export type IncomeSlice = CategorySlice;

export function incomeByCategoryInRange(
  transactions: Transaction[],
  categories: Category[],
  period: Period,
): IncomeSlice[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, number>();

  for (const tx of inRange(transactions, period)) {
    const entries =
      tx.splits && tx.splits.length > 0
        ? tx.splits
        : tx.categoryId
          ? [{ categoryId: tx.categoryId, amount: tx.amount }]
          : [];
    for (const entry of entries) {
      if (entry.amount <= 0) continue;
      totals.set(entry.categoryId, (totals.get(entry.categoryId) ?? 0) + entry.amount);
    }
  }

  return Array.from(totals.entries())
    .map(([categoryId, amount]) => {
      const category = categoryById.get(categoryId);
      return {
        categoryId,
        name: category?.name ?? getDict().reportsDomain.uncategorized,
        icon: category?.icon ?? 'help-circle',
        color: category?.color ?? '#8b98a9',
        amount,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

function sumIncomeExpense(transactions: Transaction[]): { income: number; expense: number } {
  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    if (tx.amount >= 0) income += tx.amount;
    else expense += Math.abs(tx.amount);
  }
  return { income, expense };
}

export function incomeExpenseTotals(transactions: Transaction[], month: string): { income: number; expense: number } {
  return sumIncomeExpense(inMonth(transactions, month));
}

export function incomeExpenseTotalsInRange(
  transactions: Transaction[],
  period: Period,
): { income: number; expense: number } {
  return sumIncomeExpense(inRange(transactions, period));
}

export type BucketTotals = { needs: number; wants: number; savings: number };

export function bucketTotals(transactions: Transaction[], categories: Category[], month: string): BucketTotals {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const totals: BucketTotals = { needs: 0, wants: 0, savings: 0 };

  for (const slice of expenseByCategory(transactions, categories, month)) {
    const bucket = categoryById.get(slice.categoryId)?.bucket;
    if (bucket) totals[bucket] += slice.amount;
  }
  return totals;
}

export type PayeeTotal = { payeeId: string; name: string; amount: number };

export function topPayees(transactions: Transaction[], payees: Payee[], month: string, limit = 5): PayeeTotal[] {
  const payeeById = new Map(payees.map((p) => [p.id, p]));
  const totals = new Map<string, number>();

  for (const tx of inMonth(transactions, month)) {
    if (!tx.payeeId || tx.amount >= 0) continue;
    totals.set(tx.payeeId, (totals.get(tx.payeeId) ?? 0) + Math.abs(tx.amount));
  }

  return Array.from(totals.entries())
    .map(([payeeId, amount]) => ({
      payeeId,
      name: payeeById.get(payeeId)?.name ?? getDict().reportsDomain.unknown,
      amount,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export type NetWorthPoint = { month: string; netWorth: number };

export function netWorthSeries(
  accounts: Account[],
  transactions: Transaction[],
  monthsBack: number,
  endMonth: string,
): NetWorthPoint[] {
  const points: NetWorthPoint[] = [];
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const month = shiftMonth(endMonth, -i);
    const netWorth = accounts.reduce((sum, account) => {
      const activity = transactions
        .filter((tx) => !tx.deleted && tx.accountId === account.id && transactionMonth(tx.date) <= month)
        .reduce((accSum, tx) => accSum + tx.amount, 0);
      return sum + account.openingBalance + activity;
    }, 0);
    points.push({ month, netWorth });
  }
  return points;
}
