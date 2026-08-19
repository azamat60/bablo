import type { CategorySlice } from '@/domain/reports';
import type { HomeRowVm } from './HomePage.types';

export function toCategoryRows(slices: CategorySlice[]): HomeRowVm[] {
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);
  return slices.map((slice) => ({
    categoryId: slice.categoryId,
    name: slice.name,
    icon: slice.icon,
    color: slice.color,
    amountMinorUnits: slice.amount,
    share: total > 0 ? slice.amount / total : 0,
  }));
}

export type PeriodDelta = { percent: number; direction: 'up' | 'down' | 'flat' };

export function periodDelta(current: number, previous: number): PeriodDelta | null {
  if (previous === 0 && current === 0) return { percent: 0, direction: 'flat' };
  if (previous === 0) return null;
  const diff = current - previous;
  const percent = Math.round((Math.abs(diff) / previous) * 100);
  if (percent === 0) return { percent: 0, direction: 'flat' };
  return { percent, direction: diff > 0 ? 'up' : 'down' };
}
