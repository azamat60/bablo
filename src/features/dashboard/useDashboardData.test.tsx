// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/db/types';
import { en } from '@/i18n/en';
import { DEBT_TILE_ID } from '@/domain/debts';
import { useDashboardData } from './useDashboardData';
import type { DashboardSection } from './DashboardPage.types';

const data = vi.hoisted(() => ({
  accounts: [] as Account[],
  balances: new Map<string, number>(),
  converted: new Map<string, number>(),
}));
vi.mock('@/db/queries/accounts', () => ({ useAccounts: () => data.accounts }));
vi.mock('@/db/queries/categories', () => ({ useCategoryGroups: () => [] }));
vi.mock('@/db/queries/budgets', () => ({ useBudgets: () => [] }));
vi.mock('@/db/queries/settings', () => ({ useSettings: () => ({ baseCurrency: 'KGS' }) }));
vi.mock('@/db/queries/transactions', () => ({
  useAccountBalances: () => data.balances,
  useBalancesInBase: () => data.converted,
  useTransactionsInRange: () => [],
}));
vi.mock('@/i18n', () => ({ useT: () => en }));

let root: Root;
let container: HTMLDivElement;

function account(id: string, type: Account['type'], currency = 'KGS'): Account {
  return {
    id,
    type,
    currency,
    name: id,
    openingBalance: 0,
    color: '#fff',
    icon: 'wallet',
    order: 0,
    archived: false,
    deleted: false,
    rev: 1,
    updatedAt: 1,
  };
}

function Harness() {
  const dashboard = useDashboardData({ kind: 'month', anchor: '2026-10-15' });
  return <output>{JSON.stringify(dashboard.sections.find((section) => section.id === 'accounts'))}</output>;
}

function section(): DashboardSection {
  act(() => root.render(<Harness />));
  return JSON.parse(container.textContent ?? '') as DashboardSection;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  root = createRoot(container);
  data.accounts = [account('cash', 'cash'), account('person', 'debt')];
  data.balances = new Map([
    ['cash', 100000],
    ['person', 0],
  ]);
  data.converted = new Map(data.balances);
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe('dashboard account total', () => {
  it.each([-450000, 250000])('excludes debt balance %i while retaining its own tile', (debt) => {
    data.balances.set('person', debt);
    data.converted.set('person', debt);
    const result = section();
    expect(result.total).toBe(100000);
    expect(result.incomplete).toBe(false);
    expect(result.tiles.find((tile) => tile.id === DEBT_TILE_ID)?.amount).toBe(debt);
  });

  it('keeps missing debt exchange rates separate from the wallet total', () => {
    data.accounts[1] = account('person', 'debt', 'USD');
    data.balances.set('person', 20000);
    data.converted.delete('person');
    const result = section();
    expect(result.total).toBe(100000);
    expect(result.incomplete).toBe(false);
    expect(result.tiles.find((tile) => tile.id === DEBT_TILE_ID)?.incomplete).toBe(true);
  });

  it('still flags a wallet with no exchange rate', () => {
    data.accounts.push(account('card', 'debit_card', 'USD'));
    data.balances.set('card', 5000);
    const result = section();
    expect(result.total).toBe(100000);
    expect(result.incomplete).toBe(true);
  });

  it('adds converted wallet balances and reflects actual wallet movements', () => {
    data.accounts.push(account('card', 'debit_card', 'USD'));
    data.balances.set('card', 5000);
    data.converted.set('card', 435000);
    expect(section().total).toBe(535000);
    data.balances = new Map([...data.balances, ['cash', 120000], ['person', -20000]]);
    data.converted = new Map([...data.converted, ['cash', 120000], ['person', -20000]]);
    expect(section().total).toBe(555000);
  });

  it('shows zero when there are debts but no wallets', () => {
    data.accounts = [account('person', 'debt')];
    data.balances.set('person', 20000);
    data.converted.set('person', 20000);
    const result = section();
    expect(result.total).toBe(0);
    expect(result.tiles).toHaveLength(1);
    expect(result.tiles[0]?.id).toBe(DEBT_TILE_ID);
  });
});
