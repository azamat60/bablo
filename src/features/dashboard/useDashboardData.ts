import { useMemo } from 'react';
import { format } from 'date-fns';
import { useAccounts } from '@/db/queries/accounts';
import { useCategoryGroups } from '@/db/queries/categories';
import { useBudgets } from '@/db/queries/budgets';
import { useAccountBalances, useBalancesInBase, useTransactionsInRange } from '@/db/queries/transactions';
import { useSettings } from '@/db/queries/settings';
import { buildCategoryGroupIndex, groupActivity, groupIcon } from '@/domain/groups';
import { periodRange, type Period } from '@/domain/period';
import { useT } from '@/i18n';
import type { DashboardSection, DashboardTile } from './DashboardPage.types';

export type DashboardData = {
  sections: DashboardSection[];
  baseCurrency: string;
  isEmpty: boolean;
};

export function useDashboardData(period: Period): DashboardData {
  const t = useT();
  const settings = useSettings();
  const accounts = useAccounts();
  const groups = useCategoryGroups();
  const budgets = useBudgets();
  const balances = useAccountBalances();
  // Native figures on each tile, base-converted figures for the section total.
  const balancesInBase = useBalancesInBase();

  const { from, to } = useMemo(() => periodRange(period), [period]);
  const fromIso = format(from, 'yyyy-MM-dd');
  const toIso = format(to, 'yyyy-MM-dd');
  const transactions = useTransactionsInRange(fromIso, toIso);

  const baseCurrency = settings?.baseCurrency ?? 'USD';
  const periodMonth = period.kind === 'month' ? fromIso.slice(0, 7) : undefined;

  return useMemo(() => {
    const allCategories = groups.flatMap((group) => group.categories);
    const categoryGroupIndex = buildCategoryGroupIndex(allCategories);
    const activity = groupActivity(transactions, categoryGroupIndex);

    // Budgets are stored per category; a tile shows the group's rollup.
    const assignedByGroup = new Map<string, number>();
    if (periodMonth) {
      for (const entry of budgets) {
        if (entry.month !== periodMonth) continue;
        const groupId = categoryGroupIndex.get(entry.categoryId);
        if (!groupId) continue;
        assignedByGroup.set(groupId, (assignedByGroup.get(groupId) ?? 0) + entry.assigned);
      }
    }

    const groupTile = (group: (typeof groups)[number]): DashboardTile => {
      const amount = activity.get(group.id)?.amount ?? 0;
      return {
        id: group.id,
        kind: group.kind === 'income' ? 'incomeGroup' : 'expenseGroup',
        color: group.color,
        icon: groupIcon(group, group.categories),
        label: group.name,
        // Expenses are stored negative; tiles read better unsigned.
        amount: Math.abs(amount),
        currency: baseCurrency,
        assigned: group.kind === 'expense' ? assignedByGroup.get(group.id) : undefined,
      };
    };

    const incomeTiles = groups.filter((g) => g.kind === 'income').map(groupTile);
    const expenseTiles = groups.filter((g) => g.kind === 'expense').map(groupTile);

    const accountTiles: DashboardTile[] = accounts.map((account) => ({
      id: account.id,
      kind: 'account',
      color: account.color,
      icon: account.icon,
      label: account.name,
      amount: balances.get(account.id) ?? account.openingBalance,
      currency: account.currency,
    }));

    // Each account contributes its balance converted into the base currency.
    // An account whose rate is unknown is left out rather than added at parity,
    // so the total is either right or visibly incomplete.
    const converted = accounts.map((account) => balancesInBase.get(account.id));
    const accountsTotal = converted.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    const missingRates = converted.some((value) => value === undefined);
    const accountsCurrency = baseCurrency;

    const sum = (tiles: DashboardTile[]) => tiles.reduce((total, tile) => total + tile.amount, 0);
    const assignedTotal = expenseTiles.reduce((total, tile) => total + (tile.assigned ?? 0), 0);

    const sections: DashboardSection[] = [
      { id: 'income', title: t.dashboard.income, tiles: incomeTiles, total: sum(incomeTiles), currency: baseCurrency },
      {
        id: 'accounts',
        title: t.dashboard.accounts,
        tiles: accountTiles,
        total: accountsTotal,
        incomplete: missingRates,
        currency: accountsCurrency,
      },
      {
        id: 'expenses',
        title: t.dashboard.expenses,
        tiles: expenseTiles,
        total: sum(expenseTiles),
        assignedTotal: assignedTotal > 0 ? assignedTotal : undefined,
        currency: baseCurrency,
      },
    ];

    return {
      sections,
      baseCurrency,
      isEmpty: accounts.length === 0 && groups.length === 0,
    };
  }, [groups, accounts, budgets, balances, balancesInBase, transactions, baseCurrency, periodMonth, t]);
}
