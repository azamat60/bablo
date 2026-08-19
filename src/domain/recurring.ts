import { addDays, addMonths, addWeeks, addYears, format, parseISO, setDate } from 'date-fns';
import type { RecurringFrequency } from '@/db/types';

export function computeNextRun(
  current: string,
  frequency: RecurringFrequency,
  interval: number,
  dayOfMonth?: number,
): string {
  const date = parseISO(current);
  let next: Date;
  switch (frequency) {
    case 'daily':
      next = addDays(date, interval);
      break;
    case 'weekly':
      next = addWeeks(date, interval);
      break;
    case 'biweekly':
      next = addWeeks(date, interval * 2);
      break;
    case 'monthly':
      next = addMonths(date, interval);
      if (dayOfMonth) next = setDate(next, Math.min(dayOfMonth, 28));
      break;
    case 'yearly':
      next = addYears(date, interval);
      break;
  }
  return format(next, 'yyyy-MM-dd');
}
