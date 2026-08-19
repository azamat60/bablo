import { useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { AppIcon } from '@/components/AppIcon';
import { createAccount } from '@/db/queries/accounts';
import { useSettings } from '@/db/queries/settings';
import { toMinorUnits } from '@/domain/money';
import { useT } from '@/i18n';
import type { AccountType } from '@/db/types';
import { ACCOUNT_COLORS, ACCOUNT_TYPE_OPTIONS } from './AccountsPage.constants';
import styles from './AccountFormSheet.module.css';

type AccountFormSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function AccountFormSheet({ open, onClose }: AccountFormSheetProps) {
  const t = useT();
  const settings = useSettings();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('cash');
  const [openingBalance, setOpeningBalance] = useState('');
  const [color, setColor] = useState(ACCOUNT_COLORS[0] ?? '#4f8dfd');
  const [saving, setSaving] = useState(false);

  const resetAndClose = () => {
    setName('');
    setType('cash');
    setOpeningBalance('');
    onClose();
  };

  const handleSave = async () => {
    if (!name.trim() || !settings) return;
    setSaving(true);
    const icon = ACCOUNT_TYPE_OPTIONS.find((option) => option.type === type)?.icon ?? 'wallet';
    await createAccount({
      name: name.trim(),
      type,
      currency: settings.baseCurrency,
      openingBalance: toMinorUnits(openingBalance),
      color,
      icon,
    });
    setSaving(false);
    resetAndClose();
  };

  return (
    <Sheet open={open} onClose={resetAndClose} title={t.accountForm.title}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="account-name">
          {t.accountForm.name}
        </label>
        <input
          id="account-name"
          className={styles.nameInput}
          value={name}
          placeholder={t.accountForm.namePlaceholder}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>{t.accountForm.type}</span>
        <div className={styles.typeRow}>
          {ACCOUNT_TYPE_OPTIONS.map((option) => (
            <button
              key={option.type}
              type="button"
              className={`${styles.typeChip} ${type === option.type ? styles.typeChipActive : ''}`}
              onClick={() => setType(option.type)}
            >
              <AppIcon name={option.icon} size={16} />
              {t.accountType[option.type]}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="account-balance">
          {t.accountForm.startingBalance(settings?.baseCurrency ?? '')}
        </label>
        <input
          id="account-balance"
          className={styles.balanceInput}
          inputMode="decimal"
          placeholder="0"
          value={openingBalance}
          onChange={(event) => setOpeningBalance(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>{t.accountForm.color}</span>
        <div className={styles.colorRow}>
          {ACCOUNT_COLORS.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={option}
              className={styles.colorSwatch}
              style={{ background: option, borderColor: option === color ? 'var(--color-text)' : 'transparent' }}
              onClick={() => setColor(option)}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        className={styles.saveButton}
        disabled={!name.trim() || saving}
        onClick={() => void handleSave()}
      >
        {t.accountForm.save}
      </button>
    </Sheet>
  );
}
