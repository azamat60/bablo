import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAccounts } from '@/db/queries/accounts';
import { useCategoryGroups } from '@/db/queries/categories';
import { useSettings } from '@/db/queries/settings';
import { useTransactions } from '@/db/queries/transactions';
import { db } from '@/db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useBudgetMonthStore } from '@/store/budgetMonth';
import { monthLabel, shiftMonth } from '@/domain/budget';
import { bucketTotals, expenseByCategory, incomeExpenseTotals, netWorthSeries, topPayees } from '@/domain/reports';
import { formatMoney } from '@/domain/money';
import { PageHeader } from '@/components/PageHeader';
import { useT } from '@/i18n';
import { CategoryDonut } from './CategoryDonut';
import { BucketGauge } from './BucketGauge';
import { NetWorthChart } from './NetWorthChart';
import { AiInsightCard } from './AiInsightCard';
import styles from './ReportsPage.module.css';

export function ReportsPage() {
  const t = useT();
  const month = useBudgetMonthStore((s) => s.month);
  const setMonth = useBudgetMonthStore((s) => s.setMonth);
  const settings = useSettings();
  const accounts = useAccounts();
  const allGroups = useCategoryGroups();
  const transactions = useTransactions();
  const payees = useLiveQuery(() => db.payees.toArray(), []) ?? [];

  const currency = settings?.baseCurrency ?? 'USD';
  const categories = allGroups.flatMap((g) => g.categories);

  const { income, expense } = incomeExpenseTotals(transactions, month);
  const categorySlices = expenseByCategory(transactions, categories, month);
  const buckets = bucketTotals(transactions, categories, month);
  const payeeTotals = topPayees(transactions, payees, month);
  const netWorthPoints = netWorthSeries(accounts, transactions, 6, month);

  return (
    <div className={styles.root}>
      <PageHeader title={t.tabs.reports} />

      <div className={styles.monthRow}>
        <button type="button" className={styles.monthArrow} onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <span className={styles.monthLabel}>{monthLabel(month)}</span>
        <button type="button" className={styles.monthArrow} onClick={() => setMonth(shiftMonth(month, 1))}>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>{t.reports.income}</div>
          <div className={styles.summaryValue} style={{ color: 'var(--color-income)' }}>
            {formatMoney(income, currency)}
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>{t.reports.expenses}</div>
          <div className={styles.summaryValue}>{formatMoney(expense, currency)}</div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>{t.reports.spendingByCategory}</div>
        <CategoryDonut slices={categorySlices} currency={currency} />
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>{t.reports.breakdown}</div>
        <BucketGauge totals={buckets} currency={currency} />
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>{t.reports.netWorth}</div>
        <NetWorthChart points={netWorthPoints} currency={currency} />
      </div>

      {payeeTotals.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>{t.reports.topPayees}</div>
          {payeeTotals.map((payee) => (
            <div className={styles.payeeRow} key={payee.payeeId}>
              <span className={styles.payeeName}>{payee.name}</span>
              <span className={styles.payeeAmount}>{formatMoney(payee.amount, currency)}</span>
            </div>
          ))}
        </div>
      )}

      <AiInsightCard
        month={month}
        baseCurrency={currency}
        totalIncome={income}
        totalExpense={expense}
        byCategory={categorySlices}
      />
    </div>
  );
}
