import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { db } from '@/db/db';
import { useTransactions } from '@/db/queries/transactions';
import { useSettings } from '@/db/queries/settings';
import { TransactionRow } from '@/components/TransactionRow';
import { AmountText } from '@/components/AmountText';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { groupTransactionsByDate, matchesFilter, matchesSearch } from '@/domain/transactions';
import { amountInBase, sumMinorUnits, monthKey, monthLabel, shiftMonth } from '@/domain/budget';
import { validDate } from '../../../shared/ledger';
import { useDebounce } from '@/hooks/useDebounce';
import { useT } from '@/i18n';
import type { TransactionFilter } from '@/domain/transactions';
import { CalendarMonth } from './CalendarMonth';
import { TransactionFilterSheet } from './TransactionFilterSheet';
import styles from './TransactionsPage.module.css';

export function TransactionsPage() {
  const navigate = useNavigate();
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const changeUrl = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    next.delete('limit');
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    void setSearchParams(next, { replace: true });
  };
  const settings = useSettings();
  const transactions = useTransactions();
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const payees = useLiveQuery(() => db.payees.toArray(), []);
  const searchInput = searchParams.get('q') ?? '';
  const search = useDebounce(searchInput, 300);
  const filter: TransactionFilter = {
    accountId: searchParams.get('account') ?? undefined,
    categoryId: searchParams.get('category') ?? undefined,
    dateFrom: validDate(searchParams.get('from')) ? searchParams.get('from')! : undefined,
    dateTo: validDate(searchParams.get('to')) ? searchParams.get('to')! : undefined,
  };
  const [filterOpen, setFilterOpen] = useState(false);
  const candidateMonth = searchParams.get('month') ?? filter.dateFrom?.slice(0, 7) ?? monthKey();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(candidateMonth) ? candidateMonth : monthKey();
  const selectedDate = validDate(searchParams.get('day')) ? searchParams.get('day')! : undefined;
  const setMonth = (value: string) => changeUrl({ month: value, day: undefined, from: undefined, to: undefined });
  const setFilter = (value: TransactionFilter) =>
    changeUrl({
      account: value.accountId,
      category: value.categoryId,
      from: value.dateFrom,
      to: value.dateTo,
      day: undefined,
    });
  const limit = Math.max(100, Math.min(10000, Number(searchParams.get('limit')) || 100));

  const currency = settings?.baseCurrency ?? 'USD';
  const categoryNameById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c.name])), [categories]);
  const payeeNameById = useMemo(() => new Map((payees ?? []).map((p) => [p.id, p.name])), [payees]);

  const filtered = transactions.filter((tx) => {
    if (!matchesFilter(tx, filter)) return false;
    if (!filter.dateFrom && !filter.dateTo && !tx.date.startsWith(month)) return false;
    if (selectedDate && tx.date !== selectedDate) return false;
    const categoryName = tx.categoryId ? (categoryNameById.get(tx.categoryId) ?? '') : '';
    const payeeName = tx.payeeId ? (payeeNameById.get(tx.payeeId) ?? '') : '';
    return matchesSearch(tx, search, categoryName, payeeName);
  });

  const groups = groupTransactionsByDate(filtered.slice(0, limit));
  const hasActiveFilter = Boolean(filter.accountId || filter.categoryId || filter.dateFrom || filter.dateTo);
  const counted = filtered.filter((tx) => !tx.transferId);
  const income = sumMinorUnits(...counted.filter((tx) => tx.amount > 0).map((tx) => amountInBase(tx, tx.amount)));
  const expense = sumMinorUnits(...counted.filter((tx) => tx.amount < 0).map((tx) => -amountInBase(tx, tx.amount)));

  return (
    <div className={styles.root}>
      <PageHeader title={t.tabs.transactions} className={styles.header} />

      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          placeholder={t.transactionsPage.search}
          value={searchInput}
          onChange={(event) => changeUrl({ q: event.target.value || undefined })}
        />
        <button type="button" className={styles.filterButton} onClick={() => setFilterOpen(true)}>
          <SlidersHorizontal size={18} aria-hidden="true" />
          {hasActiveFilter && <span className={styles.filterActiveDot} />}
        </button>
      </div>

      <div className={styles.monthRow}>
        <button
          type="button"
          className={styles.monthArrow}
          onClick={() => {
            setMonth(shiftMonth(month, -1));
          }}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <span className={styles.monthLabel}>{monthLabel(month)}</span>
        <button
          type="button"
          className={styles.monthArrow}
          onClick={() => {
            setMonth(shiftMonth(month, 1));
          }}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      <CalendarMonth
        month={month}
        transactions={transactions}
        selectedDate={selectedDate}
        onSelectDate={(date) => changeUrl({ day: selectedDate === date ? undefined : date })}
      />

      <div className={styles.summaryRow}>
        <SummaryItem label={t.transactionsPage.income} minorUnits={income} currency={currency} signed />
        <SummaryItem label={t.transactionsPage.expense} minorUnits={-expense} currency={currency} signed />
        <SummaryItem label={t.transactionsPage.balance} minorUnits={income - expense} currency={currency} />
      </div>

      {groups.length === 0 ? (
        <EmptyState
          label={
            transactions.length && (hasActiveFilter || search || selectedDate)
              ? 'Ничего не найдено по фильтрам'
              : t.transactionsPage.empty
          }
        />
      ) : (
        groups.map((group) => (
          <div key={group.date}>
            <div className={styles.dayLabel}>{group.label}</div>
            <div className={styles.dayGroup}>
              {group.items.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  transaction={tx}
                  showAccount
                  onClick={() => void navigate(`/transactions/${tx.id}`)}
                />
              ))}
            </div>
          </div>
        ))
      )}

      {filtered.length > limit && (
        <button type="button" onClick={() => changeUrl({ limit: String(limit + 100) })}>
          Показать ещё ({filtered.length - limit})
        </button>
      )}
      <TransactionFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filter={filter}
        onChange={setFilter}
      />
    </div>
  );
}

type SummaryItemProps = { label: string; minorUnits: number; currency: string; signed?: boolean };

function SummaryItem({ label, minorUnits, currency, signed }: SummaryItemProps) {
  return (
    <div className={styles.summaryItem}>
      <span className={styles.summaryLabel}>{label}</span>
      <AmountText className={styles.summaryValue} minorUnits={minorUnits} currency={currency} signed={signed} />
    </div>
  );
}
