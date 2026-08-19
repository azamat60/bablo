import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/db/db';
import { AppIcon } from '@/components/AppIcon';
import { useAccountBalance, useTransactions } from '@/db/queries/transactions';
import { TransactionRow } from '@/components/TransactionRow';
import { formatMoney } from '@/domain/money';
import { groupTransactionsByDate } from '@/domain/transactions';
import { useT } from '@/i18n';
import { ReconcileSheet } from './ReconcileSheet';
import styles from './AccountLedgerPage.module.css';

export function AccountLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const t = useT();
  const account = useLiveQuery(() => (id ? db.accounts.get(id) : undefined), [id]);
  const balance = useAccountBalance(id ?? '');
  const transactions = useTransactions({ accountId: id });
  const groups = groupTransactionsByDate(transactions);
  const [reconcileOpen, setReconcileOpen] = useState(false);

  if (!id || !account) return null;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <button type="button" className={styles.back} onClick={() => void navigate(-1)}>
            <ArrowLeft size={18} aria-hidden="true" />
            {t.ledger.back}
          </button>
          <button type="button" className={styles.reconcileButton} onClick={() => setReconcileOpen(true)}>
            {t.ledger.reconcile}
          </button>
        </div>
        <div className={styles.titleRow}>
          <span className={styles.icon} style={{ background: account.color }}>
            <AppIcon name={account.icon} size={22} />
          </span>
          <div>
            <div className={styles.name}>{account.name}</div>
            <div className={styles.balance}>{formatMoney(balance, account.currency)}</div>
          </div>
        </div>
      </div>
      {groups.length === 0 ? (
        <div className={styles.emptyState}>{t.ledger.empty}</div>
      ) : (
        groups.map((group) => (
          <div key={group.date}>
            <div className={styles.dayLabel}>{group.label}</div>
            <div className={styles.dayGroup}>
              {group.items.map((tx) => (
                <TransactionRow key={tx.id} transaction={tx} onClick={() => void navigate(`/transactions/${tx.id}`)} />
              ))}
            </div>
          </div>
        ))
      )}
      <ReconcileSheet open={reconcileOpen} onClose={() => setReconcileOpen(false)} account={account} />
    </div>
  );
}
