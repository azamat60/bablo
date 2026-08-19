import { v4 as uuidv4 } from 'uuid';
import { Plus } from 'lucide-react';
import { AppIcon } from '@/components/AppIcon';
import { useT } from '@/i18n';
import { ACCOUNT_TYPE_OPTIONS } from '../OnboardingPage.constants';
import type { OnboardingAccountDraft } from '../OnboardingPage.types';
import styles from './AccountsStep.module.css';

type AccountsStepProps = {
  accounts: OnboardingAccountDraft[];
  currency: string;
  onChange: (accounts: OnboardingAccountDraft[]) => void;
};

export function AccountsStep({ accounts, currency, onChange }: AccountsStepProps) {
  const t = useT();
  const updateAccount = (localId: string, patch: Partial<OnboardingAccountDraft>) => {
    onChange(accounts.map((account) => (account.localId === localId ? { ...account, ...patch } : account)));
  };

  const removeAccount = (localId: string) => {
    onChange(accounts.filter((account) => account.localId !== localId));
  };

  const addAccount = () => {
    onChange([...accounts, { localId: uuidv4(), name: '', type: 'cash', openingBalance: '' }]);
  };

  return (
    <div className={styles.list}>
      {accounts.map((account) => (
        <div className={styles.card} key={account.localId}>
          <div className={styles.cardHeader}>
            <input
              className={styles.nameInput}
              placeholder={t.onboarding.accountNamePlaceholder}
              value={account.name}
              onChange={(event) => updateAccount(account.localId, { name: event.target.value })}
            />
            {accounts.length > 1 && (
              <button type="button" className={styles.removeButton} onClick={() => removeAccount(account.localId)}>
                {t.onboarding.remove}
              </button>
            )}
          </div>
          <div className={styles.typeRow}>
            {ACCOUNT_TYPE_OPTIONS.map((option) => (
              <button
                key={option.type}
                type="button"
                className={`${styles.typeChip} ${account.type === option.type ? styles.typeChipActive : ''}`}
                onClick={() => updateAccount(account.localId, { type: option.type })}
              >
                <AppIcon name={option.icon} size={16} />
                {t.accountType[option.type]}
              </button>
            ))}
          </div>
          <div className={styles.balanceRow}>
            <span className={styles.balanceLabel}>{t.onboarding.startingBalance(currency)}</span>
            <input
              className={styles.balanceInput}
              inputMode="decimal"
              placeholder="0"
              value={account.openingBalance}
              onChange={(event) => updateAccount(account.localId, { openingBalance: event.target.value })}
            />
          </div>
        </div>
      ))}
      <button type="button" className={styles.addButton} onClick={addAccount}>
        <Plus size={16} aria-hidden="true" />
        {t.onboarding.addAnotherAccount}
      </button>
    </div>
  );
}
