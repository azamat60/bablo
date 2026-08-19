import { addDays, endOfMonth, endOfWeek, format, isToday, startOfWeek } from 'date-fns';
import type { Transaction } from '@/db/types';

export type DayTotal = { income: number; expense: number };

export function dailyTotals(transactions: Transaction[]): Map<string, DayTotal> {
  const totals = new Map<string, DayTotal>();
  for (const tx of transactions) {
    if (tx.deleted || tx.transferId) continue;
    const entry = totals.get(tx.date) ?? { income: 0, expense: 0 };
    if (tx.amount >= 0) entry.income += tx.amount;
    else entry.expense += Math.abs(tx.amount);
    totals.set(tx.date, entry);
  }
  return totals;
}

export type CalendarDay = { date: string; dayOfMonth: number; inMonth: boolean; isToday: boolean };

export function monthGridDays(month: string): CalendarDay[] {
  const [year, monthNum] = month.split('-').map(Number);
  const anchor = new Date(year!, monthNum! - 1, 1);
  const gridStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });

  const days: CalendarDay[] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    days.push({
      date: format(cursor, 'yyyy-MM-dd'),
      dayOfMonth: cursor.getDate(),
      inMonth: cursor.getMonth() === anchor.getMonth(),
      isToday: isToday(cursor),
    });
    cursor = addDays(cursor, 1);
  }
  return days;
}
