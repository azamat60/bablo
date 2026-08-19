import { differenceInCalendarDays, differenceInCalendarMonths, parseISO } from 'date-fns';
import type { SavingsGoal } from '@/db/types';

export function goalProgress(goal: SavingsGoal, savedMinorUnits: number): number {
  if (goal.targetAmount <= 0) return 0;
  return Math.min(1, Math.max(0, savedMinorUnits / goal.targetAmount));
}

export function monthlyNeeded(
  goal: SavingsGoal,
  savedMinorUnits: number,
  today: Date = new Date(),
): number | undefined {
  if (!goal.targetDate) return undefined;
  const remaining = goal.targetAmount - savedMinorUnits;
  if (remaining <= 0) return 0;
  const monthsLeft = Math.max(1, differenceInCalendarMonths(parseISO(goal.targetDate), today));
  return Math.ceil(remaining / monthsLeft);
}

export function daysUntilTarget(goal: SavingsGoal, today: Date = new Date()): number | undefined {
  if (!goal.targetDate) return undefined;
  return Math.max(0, differenceInCalendarDays(parseISO(goal.targetDate), today));
}
