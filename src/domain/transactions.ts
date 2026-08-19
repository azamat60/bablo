import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { getDateFnsLocale } from '@/i18n/dateFnsLocale';
import { getDict } from '@/i18n';
import type { Transaction } from '@/db/types';

export type TransactionGroup = {
  date: string;
  label: string;
  items: Transaction[];
};

export function groupTransactionsByDate(transactions: Transaction[]): TransactionGroup[] {
  const byDate = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const bucket = byDate.get(tx.date);
    if (bucket) bucket.push(tx);
    else byDate.set(tx.date, [tx]);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, label: formatDayLabel(date), items }));
}

function formatDayLabel(isoDate: string): string {
  const parsed = parseISO(isoDate);
  if (isToday(parsed)) return getDict().transactionsDomain.today;
  if (isYesterday(parsed)) return getDict().transactionsDomain.yesterday;
  return format(parsed, 'EEEE, MMM d', { locale: getDateFnsLocale() });
}

export function todayIsoDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export type TransactionFilter = {
  accountId?: string;
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export function matchesFilter(tx: Transaction, filter: TransactionFilter): boolean {
  if (filter.accountId && tx.accountId !== filter.accountId) return false;
  if (filter.dateFrom && tx.date < filter.dateFrom) return false;
  if (filter.dateTo && tx.date > filter.dateTo) return false;
  if (filter.categoryId) {
    const categoryIds = tx.splits && tx.splits.length > 0 ? tx.splits.map((s) => s.categoryId) : [tx.categoryId];
    if (!categoryIds.includes(filter.categoryId)) return false;
  }
  return true;
}

export function matchesSearch(tx: Transaction, query: string, categoryName: string, payeeName: string): boolean {
  if (!query.trim()) return true;
  const haystack = `${tx.memo ?? ''} ${categoryName} ${payeeName}`.toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}
