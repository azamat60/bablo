import { describe, expect, it } from 'vitest';
import {
  buildMonthBudgetIndex,
  categoryAssignedInMonth,
  categoryAvailable,
  categoryActivityInMonth,
  categoryTotals,
  summarizeGroup,
} from '../budget';
import type { BudgetEntry, Category, Transaction } from '@/db/types';

const meta = (id: string) => ({ id, updatedAt: 0, rev: 1, deleted: false });

function tx(over: Partial<Transaction> & { id: string; date: string }): Transaction {
  return {
    ...meta(over.id),
    accountId: 'acc-1',
    amount: 0,
    currency: 'KGS',
    rate: 1,
    cleared: true,
    tags: [],
    attachmentIds: [],
    source: 'manual',
    ...over,
  };
}

function budget(id: string, month: string, categoryId: string, assigned: number): BudgetEntry {
  return { ...meta(id), month, categoryId, assigned };
}

function category(id: string, groupId: string): Category {
  return {
    ...meta(id),
    groupId,
    name: id,
    icon: 'tag',
    color: '#fff',
    order: 0,
    archived: false,
    isSystem: false,
  };
}

const MONTH = '2026-09';

describe('buildMonthBudgetIndex', () => {
  it('matches the per-category helpers it replaces', () => {
    const budgets = [
      budget('b1', '2026-08', 'groceries', 50_000),
      budget('b2', MONTH, 'groceries', 60_000),
      budget('b3', MONTH, 'taxi', 10_000),
      budget('b4', '2026-10', 'groceries', 99_000), // future: must be ignored
    ];
    const transactions = [
      tx({ id: 't1', date: '2026-08-14', categoryId: 'groceries', amount: -20_000 }),
      tx({ id: 't2', date: '2026-09-03', categoryId: 'groceries', amount: -15_000 }),
      tx({ id: 't3', date: '2026-09-09', categoryId: 'taxi', amount: -4_000 }),
      tx({ id: 't4', date: '2026-10-01', categoryId: 'groceries', amount: -7_000 }), // future
      tx({ id: 't5', date: '2026-09-05', categoryId: 'groceries', amount: -3_000, deleted: true }),
      tx({ id: 't6', date: '2026-09-06', amount: -8_000, transferId: 'tr-1' }),
    ];

    const index = buildMonthBudgetIndex(budgets, transactions, MONTH);

    for (const id of ['groceries', 'taxi']) {
      const totals = categoryTotals(index, id);
      expect(totals.assigned).toBe(categoryAssignedInMonth(budgets, id, MONTH));
      expect(totals.activity).toBe(categoryActivityInMonth(transactions, id, MONTH));
      expect(totals.available).toBe(categoryAvailable(budgets, transactions, id, MONTH));
    }

    expect(categoryTotals(index, 'groceries')).toEqual({
      assigned: 60_000,
      activity: -15_000,
      available: 50_000 + 60_000 - 20_000 - 15_000,
    });
  });

  it('fans a split transaction out across its categories', () => {
    const transactions = [
      tx({
        id: 't1',
        date: '2026-09-04',
        amount: -30_000,
        splits: [
          { categoryId: 'groceries', amount: -20_000 },
          { categoryId: 'household', amount: -10_000 },
        ],
      }),
    ];
    const index = buildMonthBudgetIndex([], transactions, MONTH);
    expect(categoryTotals(index, 'groceries').activity).toBe(-20_000);
    expect(categoryTotals(index, 'household').activity).toBe(-10_000);
  });

  it('returns zeroed totals for a category with no history', () => {
    const index = buildMonthBudgetIndex([], [], MONTH);
    expect(categoryTotals(index, 'never-used')).toEqual({ assigned: 0, activity: 0, available: 0 });
  });
});

describe('summarizeGroup', () => {
  const children = [category('groceries', 'food'), category('cafe', 'food')];

  it('sums its children', () => {
    const budgets = [budget('b1', MONTH, 'groceries', 60_000), budget('b2', MONTH, 'cafe', 20_000)];
    const transactions = [
      tx({ id: 't1', date: '2026-09-02', categoryId: 'groceries', amount: -15_000 }),
      tx({ id: 't2', date: '2026-09-08', categoryId: 'cafe', amount: -5_000 }),
    ];
    const rollup = summarizeGroup(buildMonthBudgetIndex(budgets, transactions, MONTH), children);

    expect(rollup.assigned).toBe(80_000);
    expect(rollup.activity).toBe(-20_000);
    expect(rollup.available).toBe(60_000);
    expect(rollup.hasData).toBe(true);
    expect(rollup.categories.map((c) => c.category.id)).toEqual(['groceries', 'cafe']);
  });

  it('reports hasData false when nothing is assigned or spent', () => {
    const rollup = summarizeGroup(buildMonthBudgetIndex([], [], MONTH), children);
    expect(rollup).toMatchObject({ assigned: 0, activity: 0, available: 0, hasData: false });
  });
});
