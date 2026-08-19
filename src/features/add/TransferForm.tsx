import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Calendar, StickyNote } from 'lucide-react';
import { AppIcon } from '@/components/AppIcon';
import { useAccounts } from '@/db/queries/accounts';
import { createTransfer } from '@/db/queries/transactions';
import { useNumberPad } from '@/hooks/useNumberPad';
import { NumberPad } from '@/components/NumberPad';
import { AccountPickerSheet } from '@/components/AccountPickerSheet';
import { todayIsoDate } from '@/domain/transactions';
import { useT } from '@/i18n';
import styles from './TransactionForm.module.css';

export function TransferForm() {
  const navigate = useNavigate();
  const t = useT();
  const accounts = useAccounts();
  const pad = useNumberPad();
  const [fromAccountIdOverride, setFromAccountIdOverride] = useState<string | undefined>();
  const [toAccountIdOverride, setToAccountIdOverride] = useState<string | undefined>();
  const [date, setDate] = useState(todayIsoDate());
  const [memo, setMemo] = useState('');
  const [pickerTarget, setPickerTarget] = useState<'from' | 'to' | null>(null);

  const fromAccountId = fromAccountIdOverride ?? accounts[0]?.id;
  const toAccountId = toAccountIdOverride ?? accounts.find((a) => a.id !== fromAccountId)?.id;

  const fromAccount = accounts.find((a) => a.id === fromAccountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const currency = fromAccount?.currency ?? 'USD';

  const canSave = Boolean(fromAccountId) && Boolean(toAccountId) && fromAccountId !== toAccountId && pad.minorUnits > 0;

  const handleSave = async () => {
    if (!canSave || !fromAccountId || !toAccountId || !fromAccount || !toAccount) return;
    await createTransfer({
      fromAccountId,
      toAccountId,
      amount: pad.minorUnits,
      fromCurrency: fromAccount.currency,
      toCurrency: toAccount.currency,
      date,
      memo: memo.trim() || undefined,
    });
    void navigate(-1);
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button type="button" className={styles.back} onClick={() => void navigate(-1)}>
          <ArrowLeft size={18} aria-hidden="true" />
          {t.transfer.back}
        </button>
        <span className={styles.title}>{t.transfer.title}</span>
        <button type="button" className={styles.save} disabled={!canSave} onClick={() => void handleSave()}>
          {t.transfer.save}
        </button>
      </div>

      <div className={styles.amountWrap}>
        <span className={styles.amount}>
          {pad.displayText}
          <span className={styles.currency}>{currency}</span>
        </span>
      </div>

      <div className={styles.fields}>
        <button type="button" className={styles.fieldRow} onClick={() => setPickerTarget('from')}>
          <AppIcon name={fromAccount?.icon ?? 'wallet'} size={18} className={styles.fieldIcon} />
          <span className={styles.fieldLabel}>{t.transfer.from}</span>
          <span className={styles.fieldValue}>{fromAccount?.name ?? t.common.choose}</span>
        </button>
        <button type="button" className={styles.fieldRow} onClick={() => setPickerTarget('to')}>
          <AppIcon name={toAccount?.icon ?? 'wallet'} size={18} className={styles.fieldIcon} />
          <span className={styles.fieldLabel}>{t.transfer.to}</span>
          <span className={styles.fieldValue}>{toAccount?.name ?? t.common.choose}</span>
        </button>
        <div className={styles.fieldRow}>
          <Calendar className={styles.fieldIcon} size={18} aria-hidden="true" />
          <span className={styles.fieldLabel}>{t.transfer.date}</span>
          <input
            type="date"
            className={styles.dateInput}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <div className={styles.fieldRow}>
          <StickyNote className={styles.fieldIcon} size={18} aria-hidden="true" />
          <input
            className={styles.memoInput}
            placeholder={t.transfer.memoPlaceholder}
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
          />
        </div>
      </div>

      <div className={styles.spacer} />
      <div className={styles.padWrap}>
        <NumberPad onKey={pad.press} />
      </div>

      <AccountPickerSheet
        open={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        excludeAccountId={pickerTarget === 'from' ? toAccountId : fromAccountId}
        onSelect={(id) => {
          if (pickerTarget === 'from') setFromAccountIdOverride(id);
          else if (pickerTarget === 'to') setToAccountIdOverride(id);
          setPickerTarget(null);
        }}
      />
    </div>
  );
}
