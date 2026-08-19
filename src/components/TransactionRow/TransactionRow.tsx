import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { AppIcon } from '@/components/AppIcon';
import { formatMoney } from '@/domain/money';
import { useT } from '@/i18n';
import type { Transaction } from '@/db/types';
import styles from './TransactionRow.module.css';

type TransactionRowProps = {
  transaction: Transaction;
  showAccount?: boolean;
  onClick?: () => void;
};

export function TransactionRow({ transaction, showAccount, onClick }: TransactionRowProps) {
  const t = useT();
  const category = useLiveQuery(
    () => (transaction.categoryId ? db.categories.get(transaction.categoryId) : undefined),
    [transaction.categoryId],
  );
  const account = useLiveQuery(() => db.accounts.get(transaction.accountId), [transaction.accountId]);
  const payee = useLiveQuery(
    () => (transaction.payeeId ? db.payees.get(transaction.payeeId) : undefined),
    [transaction.payeeId],
  );

  const isTransfer = Boolean(transaction.transferId);
  const isSplit = Boolean(transaction.splits && transaction.splits.length > 0);
  const icon = isTransfer ? 'repeat' : isSplit ? 'split' : (category?.icon ?? 'help-circle');
  const title = isTransfer
    ? transaction.amount < 0
      ? t.transactionRow.transferOut
      : t.transactionRow.transferIn
    : isSplit
      ? t.transactionRow.splitCount(transaction.splits?.length ?? 0)
      : (payee?.name ?? category?.name ?? t.transactionRow.uncategorized);
  const subtitle = [showAccount ? account?.name : null, transaction.memo].filter(Boolean).join(' · ');

  const amountClass = transaction.amount < 0 ? styles.expense : styles.income;

  return (
    <button type="button" className={styles.row} onClick={onClick}>
      <AppIcon name={icon} size={20} className={styles.icon} />
      <span className={styles.body}>
        <span className={styles.title}>{title}</span>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </span>
      <span className={`${styles.amount} ${amountClass}`}>{formatMoney(transaction.amount, transaction.currency)}</span>
    </button>
  );
}
