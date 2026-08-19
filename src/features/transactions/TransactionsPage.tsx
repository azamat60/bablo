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
import { monthKey, monthLabel, shiftMonth } from '@/domain/budget';
import { incomeExpenseTotalsInRange } from '@/domain/reports';
import { useDebounce } from '@/hooks/useDebounce';
import { useT } from '@/i18n';
import type { TransactionFilter } from '@/domain/transactions';
import { CalendarMonth } from './CalendarMonth';
import { TransactionFilterSheet } from './TransactionFilterSheet';
import styles from './TransactionsPage.module.css';

export function TransactionsPage() {
  const navigate = useNavigate();
  const t = useT();
  const [searchParams] = useSearchParams();
  const settings = useSettings();
  const transactions = useTransactions();
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const payees = useLiveQuery(() => db.payees.toArray(), []);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [filter, setFilter] = useState<TransactionFilter>(() => ({
    categoryId: searchParams.get('category') ?? undefined,
    dateFrom: searchParams.get('from') ?? undefined,
    dateTo: searchParams.get('to') ?? undefined,
  }));
  const [filterOpen, setFilterOpen] = useState(false);
  const [month, setMonth] = useState(() => searchParams.get('from')?.slice(0, 7) ?? monthKey());
  const [selectedDate, setSelectedDate] = useState<string>();

  const currency = settings?.baseCurrency ?? 'USD';
  const categoryNameById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c.name])), [categories]);
  const payeeNameById = useMemo(() => new Map((payees ?? []).map((p) => [p.id, p.name])), [payees]);

  const filtered = transactions.filter((tx) => {
    if (!matchesFilter(tx, filter)) return false;
    if (selectedDate && tx.date !== selectedDate) return false;
    const categoryName = tx.categoryId ? (categoryNameById.get(tx.categoryId) ?? '') : '';
    const payeeName = tx.payeeId ? (payeeNameById.get(tx.payeeId) ?? '') : '';
    return matchesSearch(tx, search, categoryName, payeeName);
  });

  const groups = groupTransactionsByDate(filtered);
  const hasActiveFilter = Boolean(filter.accountId || filter.categoryId || filter.dateFrom || filter.dateTo);
  const { income, expense } = incomeExpenseTotalsInRange(transactions, { kind: 'month', anchor: `${month}-01` });

  return (
    <div className={styles.root}>
      <PageHeader title={t.tabs.transactions} />

      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          placeholder={t.transactionsPage.search}
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
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
            setSelectedDate(undefined);
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
            setSelectedDate(undefined);
          }}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      <CalendarMonth
        month={month}
        transactions={transactions}
        selectedDate={selectedDate}
        onSelectDate={(date) => setSelectedDate((current) => (current === date ? undefined : date))}
      />

      <div className={styles.summaryRow}>
        <SummaryItem label={t.transactionsPage.income} minorUnits={income} currency={currency} signed />
        <SummaryItem label={t.transactionsPage.expense} minorUnits={-expense} currency={currency} signed />
        <SummaryItem label={t.transactionsPage.balance} minorUnits={income - expense} currency={currency} />
      </div>

      {groups.length === 0 ? (
        <EmptyState label={t.transactionsPage.empty} />
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
