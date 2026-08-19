import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { getDateFnsLocale } from '@/i18n/dateFnsLocale';

export type PeriodKind = 'day' | 'week' | 'month' | 'year';

export type Period = {
  kind: PeriodKind;
  anchor: string;
};

export function todayPeriod(kind: PeriodKind = 'month'): Period {
  return { kind, anchor: format(new Date(), 'yyyy-MM-dd') };
}

export function periodRange(period: Period): { from: Date; to: Date } {
  const anchor = parseISO(period.anchor);
  switch (period.kind) {
    case 'day':
      return { from: startOfDay(anchor), to: endOfDay(anchor) };
    case 'week':
      return { from: startOfWeek(anchor, { weekStartsOn: 1 }), to: endOfWeek(anchor, { weekStartsOn: 1 }) };
    case 'year':
      return { from: startOfYear(anchor), to: endOfYear(anchor) };
    case 'month':
    default:
      return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
  }
}

export function shiftPeriod(period: Period, delta: number): Period {
  const anchor = parseISO(period.anchor);
  const next =
    period.kind === 'day'
      ? addDays(anchor, delta)
      : period.kind === 'week'
        ? addWeeks(anchor, delta)
        : period.kind === 'year'
          ? addYears(anchor, delta)
          : addMonths(anchor, delta);
  return { kind: period.kind, anchor: format(next, 'yyyy-MM-dd') };
}

export function periodLabel(period: Period): string {
  const { from, to } = periodRange(period);
  const locale = getDateFnsLocale();
  switch (period.kind) {
    case 'day':
      return format(from, 'EEE, MMM d', { locale });
    case 'week':
      return `${format(from, 'MMM d', { locale })} – ${format(to, 'MMM d', { locale })}`;
    case 'year':
      return format(from, 'yyyy', { locale });
    case 'month':
    default:
      return format(from, 'MMMM yyyy', { locale });
  }
}

export function previousPeriod(period: Period): Period {
  return shiftPeriod(period, -1);
}

export function isDateInPeriod(dateIso: string, period: Period): boolean {
  const { from, to } = periodRange(period);
  return isWithinInterval(parseISO(dateIso), { start: from, end: to });
}

export function isTodayPeriod(period: Period): boolean {
  const today = format(new Date(), 'yyyy-MM-dd');
  return isDateInPeriod(today, period);
}
