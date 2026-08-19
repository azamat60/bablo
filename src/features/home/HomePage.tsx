import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { format } from 'date-fns';
import { Settings as SettingsIcon } from 'lucide-react';
import { useSettings } from '@/db/queries/settings';
import { useCategoryGroups } from '@/db/queries/categories';
import { useTransactions } from '@/db/queries/transactions';
import { usePeriodStore } from '@/store/period';
import { expenseByCategoryInRange, incomeByCategoryInRange, incomeExpenseTotalsInRange } from '@/domain/reports';
import { isDateInPeriod, periodRange, previousPeriod } from '@/domain/period';
import { PeriodSwitcher } from '@/components/PeriodSwitcher';
import { AmountText } from '@/components/AmountText';
import { Segmented } from '@/components/Segmented';
import { ProgressBar } from '@/components/ProgressBar';
import { AppIcon } from '@/components/AppIcon';
import { EmptyState } from '@/components/EmptyState';
import { formatMoney } from '@/domain/money';
import { useT } from '@/i18n';
import { toCategoryRows, periodDelta } from './HomePage.utils';
import type { HomeRowVm } from './HomePage.types';
import styles from './HomePage.module.css';

const ROW_LIMIT = 8;
type Direction = 'expense' | 'income';

export function HomePage() {
  const t = useT();
  const navigate = useNavigate();
  const settings = useSettings();
  const allGroups = useCategoryGroups();
  const transactions = useTransactions();
  const { period, setPeriod } = usePeriodStore();
  const [direction, setDirection] = useState<Direction>('expense');
  const [expanded, setExpanded] = useState(false);

  const currency = settings?.baseCurrency ?? 'USD';
  const categories = allGroups.flatMap((g) => g.categories);

  const { income, expense } = incomeExpenseTotalsInRange(transactions, period);
  const prevTotals = incomeExpenseTotalsInRange(transactions, previousPeriod(period));

  const total = direction === 'expense' ? expense : income;
  const prevTotal = direction === 'expense' ? prevTotals.expense : prevTotals.income;
  const delta = periodDelta(total, prevTotal);

  const rows = toCategoryRows(
    direction === 'expense'
      ? expenseByCategoryInRange(transactions, categories, period)
      : incomeByCategoryInRange(transactions, categories, period),
  );
  const visibleRows = expanded ? rows : rows.slice(0, ROW_LIMIT);

  const { from, to } = periodRange(period);
  const txCount = transactions.filter(
    (tx) =>
      !tx.deleted &&
      !tx.transferId &&
      isDateInPeriod(tx.date, period) &&
      (direction === 'expense' ? tx.amount < 0 : tx.amount > 0),
  ).length;

  const goToCategory = (categoryId: string) => {
    const params = new URLSearchParams({
      category: categoryId,
      from: format(from, 'yyyy-MM-dd'),
      to: format(to, 'yyyy-MM-dd'),
    });
    void navigate(`/transactions?${params.toString()}`);
  };

  return (
    <div className={styles.root}>
      <div className={styles.topRow}>
        <PeriodSwitcher period={period} onChange={setPeriod} />
        <Link to="/settings" className={styles.settingsButton} aria-label={t.settings.title}>
          <SettingsIcon size={18} aria-hidden="true" />
        </Link>
      </div>

      <Segmented<Direction>
        className={styles.segmented}
        options={[
          { value: 'expense', label: t.home.expenseTab },
          { value: 'income', label: t.home.incomeTab },
        ]}
        value={direction}
        onChange={setDirection}
      />

      <AmountText className={styles.total} minorUnits={total} currency={currency} signed={false} />

      <div className={styles.subline}>
        {delta && delta.direction === 'up' && <span>{t.home.vsPreviousUp(delta.percent)}</span>}
        {delta && delta.direction === 'down' && <span>{t.home.vsPreviousDown(delta.percent)}</span>}
        {delta && delta.direction === 'flat' && <span>{t.home.vsPreviousFlat}</span>}
        {delta && <span className={styles.sublineDot}>·</span>}
        <span>{t.home.txCount(txCount)}</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          label={direction === 'expense' ? t.home.emptyExpenseTitle : t.home.emptyIncomeTitle}
          description={direction === 'expense' ? t.home.emptyExpenseBody : t.home.emptyIncomeBody}
          actionLabel={t.home.emptyAction}
          onAction={() => void navigate(direction === 'expense' ? '/add/expense' : '/add/income')}
        />
      ) : (
        <div className={styles.list}>
          {visibleRows.map((row) => (
            <CategoryRow
              key={row.categoryId}
              row={row}
              currency={currency}
              onClick={() => goToCategory(row.categoryId)}
            />
          ))}
        </div>
      )}

      {rows.length > ROW_LIMIT && (
        <button type="button" className={styles.showAll} onClick={() => setExpanded((value) => !value)}>
          {expanded ? t.home.showLess : t.home.showAll(rows.length)}
        </button>
      )}
    </div>
  );
}

type CategoryRowProps = {
  row: HomeRowVm;
  currency: string;
  onClick: () => void;
};

function CategoryRow({ row, currency, onClick }: CategoryRowProps) {
  return (
    <button type="button" className={styles.row} onClick={onClick}>
      <span className={styles.rowIcon} style={{ background: row.color }}>
        <AppIcon name={row.icon} size={16} />
      </span>
      <span className={styles.rowBody}>
        <span className={styles.rowTopLine}>
          <span className={styles.rowName}>{row.name}</span>
          <span className={styles.rowAmount}>{formatMoney(row.amountMinorUnits, currency)}</span>
        </span>
        <span className={styles.rowBottomLine}>
          <ProgressBar className={styles.rowBar} value={row.share} color={row.color} />
          <span className={styles.rowShare}>{Math.round(row.share * 100)}%</span>
        </span>
      </span>
    </button>
  );
}
