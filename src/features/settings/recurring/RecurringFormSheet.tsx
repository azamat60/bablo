import { useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { AccountPickerSheet } from '@/components/AccountPickerSheet';
import { CategoryPickerSheet } from '@/components/CategoryPickerSheet';
import { useAccounts } from '@/db/queries/accounts';
import { useSettings } from '@/db/queries/settings';
import { createRecurring } from '@/db/queries/recurring';
import { db } from '@/db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { todayIsoDate } from '@/domain/transactions';
import { toMinorUnits } from '@/domain/money';
import { useT } from '@/i18n';
import type { RecurringFrequency } from '@/db/types';
import { FREQUENCY_LABEL_KEY, FREQUENCY_OPTIONS } from './RecurringPage.constants';
import styles from './RecurringFormSheet.module.css';

type RecurringFormSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function RecurringFormSheet({ open, onClose }: RecurringFormSheetProps) {
  const t = useT();
  if (!open) return null;
  return (
    <Sheet open={open} onClose={onClose} title={t.recurringForm.title}>
      <RecurringFormBody onDone={onClose} />
    </Sheet>
  );
}

function RecurringFormBody({ onDone }: { onDone: () => void }) {
  const t = useT();
  const accounts = useAccounts();
  const settings = useSettings();
  const [accountIdOverride, setAccountIdOverride] = useState<string | undefined>();
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [amountText, setAmountText] = useState('');
  const [direction, setDirection] = useState<'expense' | 'income'>('expense');
  const [memo, setMemo] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [nextRun, setNextRun] = useState(todayIsoDate());
  const [autoPost, setAutoPost] = useState(true);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const accountId = accountIdOverride ?? accounts[0]?.id;
  const account = accounts.find((a) => a.id === accountId);
  const category = useLiveQuery(() => (categoryId ? db.categories.get(categoryId) : undefined), [categoryId]);
  const currency = account?.currency ?? settings?.baseCurrency ?? 'USD';

  const canSave = Boolean(accountId) && toMinorUnits(amountText) > 0 && Boolean(categoryId);

  const handleSave = async () => {
    if (!canSave || !accountId || !categoryId) return;
    setSaving(true);
    const magnitude = toMinorUnits(amountText);
    await createRecurring({
      accountId,
      amount: direction === 'expense' ? -magnitude : magnitude,
      currency,
      categoryId,
      memo: memo.trim() || undefined,
      frequency,
      interval: 1,
      nextRun,
      autoPost,
    });
    setSaving(false);
    onDone();
  };

  return (
    <div>
      <div className={styles.field}>
        <span className={styles.label}>{t.recurringForm.amount}</span>
        <input
          className={styles.amountInput}
          inputMode="decimal"
          placeholder="0"
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <div className={styles.chipRow}>
          <button
            type="button"
            className={`${styles.chip} ${direction === 'expense' ? styles.chipActive : ''}`}
            onClick={() => setDirection('expense')}
          >
            {t.recurringForm.expense}
          </button>
          <button
            type="button"
            className={`${styles.chip} ${direction === 'income' ? styles.chipActive : ''}`}
            onClick={() => setDirection('income')}
          >
            {t.recurringForm.income}
          </button>
        </div>
      </div>
      <div className={styles.field}>
        <button type="button" className={styles.row} onClick={() => setAccountPickerOpen(true)}>
          <span className={styles.rowLabel}>{t.recurringForm.account}</span>
          <span className={styles.rowValue}>{account?.name ?? t.recurringForm.choose}</span>
        </button>
      </div>
      <div className={styles.field}>
        <button type="button" className={styles.row} onClick={() => setCategoryPickerOpen(true)}>
          <span className={styles.rowLabel}>{t.recurringForm.category}</span>
          <span className={styles.rowValue}>{category?.name ?? t.recurringForm.choose}</span>
        </button>
      </div>
      <div className={styles.field}>
        <span className={styles.label}>{t.recurringForm.frequency}</span>
        <div className={styles.chipRow}>
          {FREQUENCY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`${styles.chip} ${frequency === option.value ? styles.chipActive : ''}`}
              onClick={() => setFrequency(option.value)}
            >
              {t.recurringConst[FREQUENCY_LABEL_KEY[option.value]]}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.field}>
        <span className={styles.label}>{t.recurringForm.firstRun}</span>
        <input
          type="date"
          className={styles.dateInput}
          value={nextRun}
          onChange={(event) => setNextRun(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <input
          className={styles.amountInput}
          placeholder={t.recurringForm.memoPlaceholder}
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
        />
      </div>
      <div className={styles.toggleRow}>
        <span className={styles.rowLabel}>{t.recurringForm.autoPost}</span>
        <input type="checkbox" checked={autoPost} onChange={(event) => setAutoPost(event.target.checked)} />
      </div>
      <button
        type="button"
        className={styles.saveButton}
        disabled={!canSave || saving}
        onClick={() => void handleSave()}
      >
        {t.recurringForm.save}
      </button>
      <AccountPickerSheet
        open={accountPickerOpen}
        onClose={() => setAccountPickerOpen(false)}
        onSelect={(id) => {
          setAccountIdOverride(id);
          setAccountPickerOpen(false);
        }}
      />
      <CategoryPickerSheet
        open={categoryPickerOpen}
        onClose={() => setCategoryPickerOpen(false)}
        kind={direction}
        onSelect={(id) => {
          setCategoryId(id);
          setCategoryPickerOpen(false);
        }}
      />
    </div>
  );
}
