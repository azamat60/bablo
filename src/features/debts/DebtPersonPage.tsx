import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router';
import { ArrowDownLeft, ArrowUpRight, Pencil, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { db } from '@/db/db';
import { useAccounts } from '@/db/queries/accounts';
import { useAccountBalance, useTransactions } from '@/db/queries/transactions';
import { PageHeader } from '@/components/PageHeader';
import { useDeletion } from '@/components/DeletionProvider';
import {
  debtHistory,
  debtOperationLabel,
  debtStatus,
  debtTransferDraft,
  DEBT_TYPE,
  type DebtDirection,
} from '@/domain/debts';
import { formatMoney } from '@/domain/money';
import { useTxDraftStore } from '@/store/txDraft';
import { usePrivacyStore } from '@/store/privacy';
import { useT } from '@/i18n';
import { getDateFnsLocale } from '@/i18n/dateFnsLocale';
import { DebtPersonFormSheet } from './DebtPersonFormSheet';
import styles from './DebtsPage.module.css';

export function DebtPersonPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const t = useT();
  const person = useLiveQuery(() => (id ? db.accounts.get(id) : undefined), [id]);
  const accounts = useAccounts(true, true);
  const balance = useAccountBalance(id ?? '');
  const transactions = useTransactions({ accountId: id ?? '' });
  const allTransactions = useTransactions();
  const begin = useTxDraftStore((state) => state.begin);
  const masked = usePrivacyStore((state) => state.hideAmounts);
  const { requestAccountDeletion, requestTransactionDeletion } = useDeletion();
  const [editing, setEditing] = useState(false);
  const start = (direction: DebtDirection) => {
    if (!person) return;
    const wallet = accounts.find((account) => !account.archived && account.type !== DEBT_TYPE);
    begin(debtTransferDraft(person.id, wallet?.id, direction));
    void navigate('/add/tx');
  };

  if (!person || person.deleted || person.type !== DEBT_TYPE)
    return (
      <div className={styles.root}>
        <PageHeader title={t.debts.title} onBack={() => void navigate('/debts')} />
        <p>{t.debts.unavailable}</p>
      </div>
    );
  const history = debtHistory(transactions, person.openingBalance);
  const peers = new Map(
    allTransactions.filter((tx) => tx.transferId && tx.accountId !== person.id).map((tx) => [tx.transferId, tx]),
  );

  return (
    <div className={styles.root}>
      <PageHeader
        title={person.name}
        onBack={() => void navigate('/debts')}
        action={
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setEditing(true)}
              aria-label={t.debts.editPerson}
            >
              <Pencil size={18} />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => requestAccountDeletion(person.id, () => void navigate('/debts', { replace: true }))}
              aria-label={t.debts.deletePerson}
            >
              <Trash2 size={18} />
            </button>
          </div>
        }
      />
      <div className={styles.hero}>
        <span className={styles.heroLabel}>{debtStatus(balance)}</span>
        <div className={`${styles.heroAmount} ${balance < 0 ? styles.owed : balance > 0 ? styles.receivable : ''}`}>
          {masked ? '••••••' : formatMoney(Math.abs(balance), person.currency)}
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.operationButton} onClick={() => start('out')}>
          <ArrowUpRight size={18} />
          {t.debts.give}
        </button>
        <button type="button" className={styles.operationButton} onClick={() => start('in')}>
          <ArrowDownLeft size={18} />
          {t.debts.take}
        </button>
      </div>
      <h2 className={styles.historyTitle}>{t.debts.history}</h2>
      <div className={styles.list}>
        {history.map(({ transaction: tx, balance: after, before }) => {
          const peer = tx.transferId ? peers.get(tx.transferId) : undefined;
          const wallet = accounts.find((account) => account.id === peer?.accountId);
          const label = debtOperationLabel(tx.amount, before);
          return (
            <div key={tx.id} className={styles.historyRow}>
              <button
                type="button"
                className={styles.historyMain}
                onClick={() => void navigate(`/transactions/${tx.id}`)}
              >
                <span className={styles.date}>
                  <span>{format(parseISO(tx.date), 'd MMM', { locale: getDateFnsLocale() })}</span>
                  <span>{format(parseISO(tx.date), 'yyyy')}</span>
                </span>
                <span className={styles.personBody}>
                  <span className={styles.personName}>{label}</span>
                  <span className={styles.subtitle}>{wallet?.name}</span>
                  {tx.memo && <span className={styles.subtitle}>{tx.memo}</span>}
                </span>
                <span className={`${styles.personAmount} ${tx.amount > 0 ? styles.owed : styles.receivable}`}>
                  <span>{masked ? '••••••' : formatMoney(Math.abs(tx.amount), person.currency)}</span>
                  <span className={styles.subtitle} aria-label={t.debts.balanceAfter}>
                    {masked ? '••••••' : formatMoney(after, person.currency)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className={styles.deleteOperation}
                aria-label={t.deletion.transactionAria(label)}
                onClick={() => requestTransactionDeletion(tx.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>
      {!history.length && <p className={styles.empty}>{t.debts.noHistory}</p>}
      {person.openingBalance !== 0 && (
        <div className={styles.opening}>
          <span>{t.debts.openingEntry}</span>
          <strong>{masked ? '••••••' : formatMoney(person.openingBalance, person.currency)}</strong>
        </div>
      )}
      <DebtPersonFormSheet open={editing} onClose={() => setEditing(false)} person={person} />
    </div>
  );
}
