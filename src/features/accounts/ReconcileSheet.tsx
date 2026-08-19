import { useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { createReconciliationAdjustment, reconcileAccount } from '@/db/queries/reconcile';
import { todayIsoDate } from '@/domain/transactions';
import { formatMoney, toMinorUnits } from '@/domain/money';
import { useT } from '@/i18n';
import type { Account } from '@/db/types';
import styles from './ReconcileSheet.module.css';

type ReconcileSheetProps = {
  open: boolean;
  onClose: () => void;
  account: Account;
};

export function ReconcileSheet({ open, onClose, account }: ReconcileSheetProps) {
  const t = useT();
  if (!open) return null;
  return (
    <Sheet open={open} onClose={onClose} title={t.reconcile.title(account.name)}>
      <ReconcileSheetBody account={account} onDone={onClose} />
    </Sheet>
  );
}

function ReconcileSheetBody({ account, onDone }: { account: Account; onDone: () => void }) {
  const t = useT();
  const [statementDate, setStatementDate] = useState(todayIsoDate());
  const [balanceText, setBalanceText] = useState('');
  const [difference, setDifference] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  const handleCheck = async () => {
    setChecking(true);
    const result = await reconcileAccount(account.id, statementDate, toMinorUnits(balanceText));
    setDifference(result.difference);
    setChecking(false);
  };

  const handleAddAdjustment = async () => {
    if (difference === null || difference === 0) return;
    await createReconciliationAdjustment(account.id, statementDate, difference, account.currency);
    onDone();
  };

  if (difference !== null) {
    return (
      <div>
        <div className={styles.summary}>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>{t.reconcile.difference}</span>
            <span className={difference === 0 ? styles.differenceOk : styles.differenceBad}>
              {formatMoney(difference, account.currency)}
            </span>
          </div>
        </div>
        {difference === 0 ? (
          <button type="button" className={styles.button} onClick={onDone}>
            {t.reconcile.balancedDone}
          </button>
        ) : (
          <>
            <button type="button" className={styles.button} onClick={() => void handleAddAdjustment()}>
              {t.reconcile.addAdjustment}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={onDone}>
              {t.reconcile.skipForNow}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className={styles.field}>
        <span className={styles.label}>{t.reconcile.statementDate}</span>
        <input
          type="date"
          className={styles.input}
          value={statementDate}
          onChange={(event) => setStatementDate(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>{t.reconcile.statementBalance(account.currency)}</span>
        <input
          className={styles.input}
          inputMode="decimal"
          placeholder="0"
          value={balanceText}
          onChange={(event) => setBalanceText(event.target.value)}
        />
      </div>
      <button type="button" className={styles.button} disabled={checking} onClick={() => void handleCheck()}>
        {t.reconcile.check}
      </button>
    </div>
  );
}
