import type { RecurringFrequency } from '@/db/types';

export const FREQUENCY_OPTIONS: readonly { value: RecurringFrequency }[] = [
  { value: 'daily' },
  { value: 'weekly' },
  { value: 'biweekly' },
  { value: 'monthly' },
  { value: 'yearly' },
];

export const FREQUENCY_LABEL_KEY: Record<RecurringFrequency, 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'> = {
  daily: 'daily',
  weekly: 'weekly',
  biweekly: 'biweekly',
  monthly: 'monthly',
  yearly: 'yearly',
};
