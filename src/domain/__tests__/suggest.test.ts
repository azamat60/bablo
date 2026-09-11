import { describe, expect, it } from 'vitest';
import { suggestForGroup } from '../suggest';
import type { Category, Payee, Recurring, Transaction } from '@/db/types';

const meta = (id: string) => ({ id, updatedAt: 0, rev: 1, deleted: false });
const TODAY = '2026-09-11'; // a Friday

function category(id: string, over: Partial<Category> = {}): Category {
  return {
    ...meta(id),
    groupId: 'food',
    name: id,
    icon: 'tag',
    color: '#fff',
    order: 0,
    archived: false,
    isSystem: false,
    ...over,
  };
}

function tx(date: string, categoryId: string, amount: number, over: Partial<Transaction> = {}): Transaction {
  return {
    ...meta(`${date}-${categoryId}-${amount}-${Math.random()}`),
    accountId: 'cash',
    date,
    amount,
    currency: 'KGS',
    rate: 1,
    categoryId,
    cleared: true,
    tags: [],
    attachmentIds: [],
    source: 'manual',
    ...over,
  };
}

const base = { categories: [category('groceries'), category('cafe')], accountId: 'cash', today: TODAY };
const expense = { ...base, direction: 'expense' as const };

describe('suggestForGroup', () => {
  it('returns null when the group has no history and several children', () => {
    expect(suggestForGroup({ ...expense, transactions: [] })).toBeNull();
  });

  it('returns the only child when a group has exactly one, even with no history', () => {
    const result = suggestForGroup({ ...expense, categories: [category('groceries')], transactions: [] });
    expect(result).toMatchObject({ categoryId: 'groceries', reason: 'onlyCategory', score: 1 });
  });

  it('prefers the recent, frequent category', () => {
    const transactions = [
      tx('2026-09-10', 'groceries', -140000),
      tx('2026-09-07', 'groceries', -138000),
      tx('2026-09-04', 'groceries', -142000),
      tx('2026-06-02', 'cafe', -40000),
    ];
    expect(suggestForGroup({ ...expense, transactions })?.categoryId).toBe('groceries');
  });

  it('suppresses the suggestion when two categories are neck and neck', () => {
    const transactions = [tx('2026-09-10', 'groceries', -100000), tx('2026-09-10', 'cafe', -100000)];
    expect(suggestForGroup({ ...expense, transactions })).toBeNull();
  });

  it('ignores income when suggesting for an expense, and vice versa', () => {
    const transactions = [tx('2026-09-10', 'groceries', 50000)];
    expect(suggestForGroup({ ...expense, transactions })).toBeNull();
    expect(suggestForGroup({ ...base, direction: 'income', transactions })?.categoryId).toBe('groceries');
  });

  it('ignores deleted transactions and transfer legs', () => {
    const transactions = [
      tx('2026-09-10', 'groceries', -100000, { deleted: true }),
      tx('2026-09-09', 'groceries', -100000, { transferId: 'tr' }),
    ];
    expect(suggestForGroup({ ...expense, transactions })).toBeNull();
  });

  describe('amount', () => {
    const only = [category('groceries')];

    it('uses a repeated amount when the last few are identical', () => {
      const transactions = [
        tx('2026-09-10', 'groceries', -50000),
        tx('2026-09-08', 'groceries', -50000),
        tx('2026-09-06', 'groceries', -50000),
        tx('2026-09-01', 'groceries', -12000),
      ];
      expect(suggestForGroup({ ...expense, categories: only, transactions })).toMatchObject({
        amountMinor: 50000,
        reason: 'repeatAmount',
      });
    });

    it('uses the median, so one outlier cannot drag it up', () => {
      const transactions = [
        tx('2026-09-10', 'groceries', -50000),
        tx('2026-09-09', 'groceries', -52000),
        tx('2026-09-08', 'groceries', -51000),
        tx('2026-09-07', 'groceries', -49000),
      ];
      const result = suggestForGroup({ ...expense, categories: only, transactions });
      expect(result?.reason).toBe('typicalAmount');
      expect(result?.amountMinor).toBeGreaterThan(49000);
      expect(result?.amountMinor).toBeLessThan(52000);
    });

    it('suppresses the amount entirely when past amounts are scattered', () => {
      const transactions = [
        tx('2026-09-10', 'groceries', -5000),
        tx('2026-09-09', 'groceries', -400000),
        tx('2026-09-08', 'groceries', -20000),
        tx('2026-09-07', 'groceries', -900000),
      ];
      expect(suggestForGroup({ ...expense, categories: only, transactions })?.amountMinor).toBeUndefined();
    });

    it('prefers an active recurring rule over the statistics', () => {
      const recurring: Recurring[] = [
        {
          ...meta('r1'),
          accountId: 'cash',
          amount: -180000,
          currency: 'KGS',
          categoryId: 'groceries',
          frequency: 'monthly',
          interval: 1,
          nextRun: '2026-10-01',
          autoPost: false,
          active: true,
        },
      ];
      const transactions = [tx('2026-09-10', 'groceries', -50000), tx('2026-09-09', 'groceries', -50000)];
      expect(suggestForGroup({ ...expense, categories: only, transactions, recurring })).toMatchObject({
        amountMinor: 180000,
        reason: 'recurring',
      });
    });
  });

  it('lets a known payee override the ranking', () => {
    const payees: Payee[] = [{ ...meta('p1'), name: 'Кофейня', defaultCategoryId: 'cafe', aliases: [] }];
    const transactions = [tx('2026-09-10', 'groceries', -140000), tx('2026-09-09', 'groceries', -140000)];
    const result = suggestForGroup({ ...expense, transactions, payees, memo: '  кофейня ' });
    expect(result).toMatchObject({ categoryId: 'cafe', score: 1 });
  });
});
