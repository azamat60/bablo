import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown, ChevronLeft, ChevronRight, PiggyBank } from 'lucide-react';
import { useAccounts } from '@/db/queries/accounts';
import { useCategoryGroups } from '@/db/queries/categories';
import { useBudgets } from '@/db/queries/budgets';
import { useTransactions } from '@/db/queries/transactions';
import { useSettings } from '@/db/queries/settings';
import { useBudgetMonthStore } from '@/store/budgetMonth';
import { monthLabel, readyToAssign, shiftMonth, summarizeCategory } from '@/domain/budget';
import { formatMoney } from '@/domain/money';
import { Card } from '@/components/Card';
import { PageHeader } from '@/components/PageHeader';
import { useT } from '@/i18n';
import { CategoryBudgetRow } from './CategoryBudgetRow';
import { AssignSheet } from './AssignSheet';
import type { CategoryBudgetSummary } from '@/domain/budget';
import type { CategoryGroupWithCategories } from '@/db/queries/categories';
import styles from './BudgetPage.module.css';

type GroupVm = {
  group: CategoryGroupWithCategories;
  summaries: CategoryBudgetSummary[];
  groupAvailable: number;
  hasData: boolean;
};

export function BudgetPage() {
  const t = useT();
  const month = useBudgetMonthStore((s) => s.month);
  const setMonth = useBudgetMonthStore((s) => s.setMonth);
  const settings = useSettings();
  const accounts = useAccounts();
  const allGroups = useCategoryGroups();
  const budgets = useBudgets();
  const transactions = useTransactions();
  const [assignTarget, setAssignTarget] = useState<CategoryBudgetSummary | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string> | null>(null);

  const currency = settings?.baseCurrency ?? 'USD';
  const expenseGroups = allGroups.filter((group) => group.kind === 'expense');
  const allCategories = allGroups.flatMap((group) => group.categories);
  const toBeAssigned = readyToAssign(accounts, allGroups, allCategories, budgets, transactions, month);

  const groupVms: GroupVm[] = useMemo(
    () =>
      expenseGroups.map((group) => {
        const summaries = group.categories.map((category) => summarizeCategory(category, budgets, transactions, month));
        const groupAvailable = summaries.reduce((sum, s) => sum + s.available, 0);
        const hasData = summaries.some((s) => s.assigned !== 0 || s.activity !== 0);
        return { group, summaries, groupAvailable, hasData };
      }),
    [expenseGroups, budgets, transactions, month],
  );

  const defaultExpanded = useMemo(
    () => new Set(groupVms.filter((vm) => vm.hasData).map((vm) => vm.group.id)),
    [groupVms],
  );
  const effectiveExpanded = expandedIds ?? defaultExpanded;
  const hasHiddenGroups = groupVms.some((vm) => !vm.hasData);
  const allExpanded = groupVms.every((vm) => effectiveExpanded.has(vm.group.id));

  const toggleGroup = (id: string) => {
    const next = new Set(effectiveExpanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  const toggleShowAll = () => {
    setExpandedIds(
      allExpanded
        ? new Set(groupVms.filter((vm) => vm.hasData).map((vm) => vm.group.id))
        : new Set(groupVms.map((vm) => vm.group.id)),
    );
  };

  return (
    <div className={styles.root}>
      <PageHeader title={t.tabs.budget} />

      <div className={styles.monthRow}>
        <button type="button" className={styles.monthArrow} onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <span className={styles.monthLabel}>{monthLabel(month)}</span>
        <button type="button" className={styles.monthArrow} onClick={() => setMonth(shiftMonth(month, 1))}>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>

      <Card variant="raised" className={styles.hero}>
        <div className={styles.heroLabel}>{t.budget.readyToAssign}</div>
        <div className={`${styles.heroValue} ${toBeAssigned >= 0 ? styles.heroPositive : styles.heroNegative}`}>
          {formatMoney(toBeAssigned, currency)}
        </div>
        <div className={styles.heroHint}>{t.budget.readyToAssignHint}</div>
      </Card>

      <Link to="/savings" className={styles.savingsLink}>
        <PiggyBank size={16} aria-hidden="true" />
        {t.budget.savingsGoals}
      </Link>

      {groupVms.map(({ group, summaries, groupAvailable }) => {
        const isOpen = effectiveExpanded.has(group.id);
        return (
          <div className={styles.group} key={group.id}>
            <button type="button" className={styles.groupHeader} onClick={() => toggleGroup(group.id)}>
              <span className={styles.groupDot} style={{ background: group.color }} />
              <span className={styles.groupName}>{group.name}</span>
              <span className={styles.groupAvailable}>{formatMoney(groupAvailable, currency)}</span>
              <ChevronDown
                className={`${styles.groupChevron} ${isOpen ? styles.groupChevronOpen : ''}`}
                size={16}
                aria-hidden="true"
              />
            </button>
            {isOpen && (
              <div className={styles.categoryList}>
                {summaries.map((summary) => (
                  <CategoryBudgetRow
                    key={summary.category.id}
                    summary={summary}
                    currency={currency}
                    onClick={() => setAssignTarget(summary)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {hasHiddenGroups && (
        <button type="button" className={styles.showAllButton} onClick={toggleShowAll}>
          {allExpanded ? t.budget.hideUnfunded : t.budget.showUnfunded}
        </button>
      )}

      {assignTarget && (
        <AssignSheet
          open
          onClose={() => setAssignTarget(null)}
          summary={assignTarget}
          month={month}
          currency={currency}
        />
      )}
    </div>
  );
}
