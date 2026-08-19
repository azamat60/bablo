import type { CategoryPreset } from '@/db/seed';
export { ACCOUNT_TYPE_OPTIONS, ACCOUNT_COLORS } from '@/features/accounts/AccountsPage.constants';

export const TOTAL_STEPS = 5;

export const LANGUAGE_OPTIONS: readonly { code: 'ru' | 'en'; native: string }[] = [
  { code: 'ru', native: 'Русский' },
  { code: 'en', native: 'English' },
];

export const PRESET_OPTIONS: readonly { id: CategoryPreset }[] = [{ id: 'full' }, { id: 'minimal' }, { id: 'empty' }];

export const CURRENCY_OPTIONS: readonly { code: string }[] = [
  { code: 'KGS' },
  { code: 'USD' },
  { code: 'EUR' },
  { code: 'RUB' },
  { code: 'TRY' },
  { code: 'USDT' },
];
