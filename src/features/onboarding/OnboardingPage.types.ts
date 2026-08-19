import type { CategoryPreset } from '@/db/seed';
import type { AccountType } from '@/db/types';
import type { Locale } from '@/i18n/types';

export type OnboardingAccountDraft = {
  localId: string;
  name: string;
  type: AccountType;
  openingBalance: string;
};

export type OnboardingState = {
  step: number;
  locale: Locale;
  preset: CategoryPreset;
  currency: string;
  accounts: OnboardingAccountDraft[];
};
