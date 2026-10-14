import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Plus, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { PageHeader } from '@/components/PageHeader';
import { Segmented } from '@/components/Segmented';
import { useDebtPeople } from '@/db/queries/debts';
import { useAccounts } from '@/db/queries/accounts';
import { useAccountBalances, useBalancesInBase, useTransactions } from '@/db/queries/transactions';
import { useSettings } from '@/db/queries/settings';
import type { Account, Transaction } from '@/db/types';
import { debtStatus, debtTransferDraft, summarizeDebts, type DebtFilter } from '@/domain/debts';
import { formatMoney } from '@/domain/money';
import { usePrivacyStore } from '@/store/privacy';
import { useTxDraftStore } from '@/store/txDraft';
import { useT } from '@/i18n';
import { getDateFnsLocale } from '@/i18n/dateFnsLocale';
import { DebtPersonFormSheet } from './DebtPersonFormSheet';
import styles from './DebtsPage.module.css';

export function DebtsPage() {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const people = useDebtPeople();
  const accounts = useAccounts();
  const balances = useAccountBalances();
  const converted = useBalancesInBase();
  const transactions = useTransactions();
  const settings = useSettings();
  const masked = usePrivacyStore((state) => state.hideAmounts);
  const begin = useTxDraftStore((state) => state.begin);
  const [filter, setFilter] = useState<DebtFilter>('all');
  const [adding, setAdding] = useState(false);
  const summary = summarizeDebts(people, balances, converted, filter);
  const wallet = accounts.find((account) => account.id === params.get('account'));
  const direction = params.get('direction') === 'in' ? 'in' : 'out';
  const choosing = Boolean(wallet && params.has('direction'));
  const latest = new Map<string, Transaction>();
  for (const tx of transactions) if (!latest.has(tx.accountId)) latest.set(tx.accountId, tx);

  const select = (id: string) => {
    if (choosing) {
      begin(debtTransferDraft(id, wallet?.id, direction));
      void navigate('/add/tx');
    } else void navigate(`/debts/${id}`);
  };

  return (
    <div className={styles.root}>
      <PageHeader
        title={choosing ? t.debts.choosePerson : t.debts.title}
        onBack={() => void navigate('/')}
        action={
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setAdding(true)}
            aria-label={t.debts.addPerson}
          >
            <Plus size={20} />
          </button>
        }
      />
      {choosing ? (
        <p className={styles.selectionHint}>
          {wallet?.name} · {direction === 'out' ? t.debts.give : t.debts.take}
        </p>
      ) : (
        <>
          <Segmented
            options={[
              { value: 'owed', label: t.debts.iOwe },
              { value: 'receivable', label: t.debts.owedToMe },
              { value: 'all', label: t.debts.all },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <div className={styles.hero}>
            <span className={styles.heroLabel}>
              {filter === 'all' ? t.debts.netBalance : filter === 'owed' ? t.debts.iOwe : t.debts.owedToMe}
            </span>
            <div className={styles.heroAmount}>
              {masked ? '••••••' : formatMoney(summary.total, settings?.baseCurrency ?? 'KGS')}
              {summary.missing.length > 0 ? ' *' : ''}
            </div>
            {summary.missing.length > 0 && (
              <p className={styles.hint} role="status">
                {t.debts.missingRates(summary.missing.join(', '))}
              </p>
            )}
          </div>
        </>
      )}
      <div className={styles.list}>
        {(choosing ? people : summary.people).map((person) => (
          <DebtPersonRow
            key={person.id}
            person={person}
            balance={balances.get(person.id) ?? person.openingBalance}
            converted={person.currency === settings?.baseCurrency ? undefined : converted.get(person.id)}
            baseCurrency={settings?.baseCurrency ?? 'KGS'}
            latest={latest.get(person.id)}
            masked={masked}
            onClick={() => select(person.id)}
          />
        ))}
      </div>
      {(choosing ? people : summary.people).length === 0 && (
        <div className={styles.empty}>
          <p>{people.length ? t.debts.filterEmpty : t.debts.empty}</p>
          {!people.length && <span>{t.debts.emptyHint}</span>}
        </div>
      )}
      <button type="button" className={styles.addButton} onClick={() => setAdding(true)}>
        <Plus size={18} />
        {t.debts.addPerson}
      </button>
      <DebtPersonFormSheet open={adding} onClose={() => setAdding(false)} onSaved={choosing ? select : undefined} />
    </div>
  );
}

type RowProps = {
  person: Account;
  balance: number;
  converted?: number;
  baseCurrency: string;
  latest?: Transaction;
  masked: boolean;
  onClick: () => void;
};

function DebtPersonRow({ person, balance, converted, baseCurrency, latest, masked, onClick }: RowProps) {
  const t = useT();
  const tone = balance < 0 ? styles.owed : balance > 0 ? styles.receivable : '';
  return (
    <button type="button" className={styles.personRow} onClick={onClick}>
      <span className={`${styles.avatar} ${tone}`} aria-hidden="true">
        {person.name.slice(0, 1).toLocaleUpperCase()}
      </span>
      <span className={styles.personBody}>
        <span className={styles.personName}>{person.name}</span>
        <span className={styles.subtitle}>{debtStatus(balance)}</span>
        {latest && (
          <span className={styles.subtitle}>
            {latest.amount > 0 ? t.debts.give : t.debts.take} ·{' '}
            {format(parseISO(latest.date), 'd MMM yyyy', { locale: getDateFnsLocale() })}
          </span>
        )}
      </span>
      <span className={`${styles.personAmount} ${tone}`}>
        <span>{masked ? '••••••' : formatMoney(Math.abs(balance), person.currency)}</span>
        {converted !== undefined && (
          <span className={styles.subtitle}>
            {masked ? '••••••' : `≈ ${formatMoney(Math.abs(converted), baseCurrency)}`}
          </span>
        )}
      </span>
      <ChevronRight size={14} className={styles.chevron} aria-hidden="true" />
    </button>
  );
}
