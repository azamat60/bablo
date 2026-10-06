import { db } from '@/db/db';
import { readLedger } from '@/db/cloud';
import { seedCategoriesForPreset } from '@/db/seed';
import { parseMinorUnits } from '@/domain/money';
import { ACCOUNT_COLORS, ACCOUNT_TYPE_OPTIONS } from '@/features/onboarding/OnboardingPage.constants';
import type { OnboardingState } from '@/features/onboarding/OnboardingPage.types';
import { LEDGER_TABLES, validateLedger } from '../../../shared/ledger';
import { createAccount } from './accounts';
import { updateSettings } from './settings';

export async function completeOnboarding(state: OnboardingState): Promise<void> {
  const accounts = state.accounts.filter((account) => account.name.trim());
  if (!accounts.length) throw new Error('Добавьте хотя бы один счёт.');
  const balances = accounts.map((account) =>
    account.openingBalance.trim() ? parseMinorUnits(account.openingBalance) : 0,
  );
  if (balances.some((balance) => balance === undefined)) throw new Error('Проверьте начальные балансы.');
  await db.transaction(
    'rw',
    LEDGER_TABLES.map((name) => db.table(name)),
    async () => {
      const settings = await db.settings.get('singleton');
      if (!settings) throw new Error('Настройки бюджета не найдены.');
      if (settings.onboardingComplete) return;
      await seedCategoriesForPreset(state.preset, state.locale);
      for (const [index, draft] of accounts.entries()) {
        await createAccount({
          name: draft.name.trim(),
          type: draft.type,
          currency: state.currency,
          openingBalance: balances[index]!,
          color: ACCOUNT_COLORS[index % ACCOUNT_COLORS.length] ?? '#4f8dfd',
          icon: ACCOUNT_TYPE_OPTIONS.find((option) => option.type === draft.type)?.icon ?? 'wallet',
        });
      }
      await updateSettings({ baseCurrency: state.currency, onboardingComplete: true, locale: state.locale });
      validateLedger(await readLedger());
    },
  );
}
