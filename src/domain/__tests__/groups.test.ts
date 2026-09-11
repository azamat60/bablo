import { describe, expect, it } from 'vitest';
import { buildCategoryGroupIndex, groupActivity, groupIcon } from '../groups';
import type { Category, CategoryGroup, Transaction } from '@/db/types';

const meta = (id: string) => ({ id, updatedAt: 0, rev: 1, deleted: false });

function category(id: string, groupId: string, over: Partial<Category> = {}): Category {
  return {
    ...meta(id),
    groupId,
    name: id,
    icon: `${id}-icon`,
    color: '#fff',
    order: 0,
    archived: false,
    isSystem: false,
    ...over,
  };
}

function group(id: string, over: Partial<CategoryGroup> = {}): CategoryGroup {
  return { ...meta(id), name: id, kind: 'expense', color: '#fff', order: 0, archived: false, ...over };
}

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

describe('groupIcon', () => {
  it('prefers the group icon when set', () => {
    expect(groupIcon(group('food', { icon: 'burger' }), [category('groceries', 'food')])).toBe('burger');
  });

  it('falls back to the first non-archived child', () => {
    const children = [category('old', 'food', { archived: true }), category('groceries', 'food')];
    expect(groupIcon(group('food'), children)).toBe('groceries-icon');
  });

  it('falls back to the default icon when a group has no live children', () => {
    expect(groupIcon(group('food'), [])).toBe('tag');
    expect(groupIcon(group('food'), [category('old', 'food', { archived: true })])).toBe('tag');
  });
});

describe('groupActivity', () => {
  const categories = [category('groceries', 'food'), category('cafe', 'food'), category('taxi', 'transport')];
  const index = buildCategoryGroupIndex(categories);

  it('rolls categories up into their groups', () => {
    const totals = groupActivity(
      [
        tx({ id: 't1', date: '2026-09-01', categoryId: 'groceries', amount: -10_000 }),
        tx({ id: 't2', date: '2026-09-02', categoryId: 'cafe', amount: -4_000 }),
        tx({ id: 't3', date: '2026-09-03', categoryId: 'taxi', amount: -2_000 }),
      ],
      index,
    );

    expect(totals.get('food')).toEqual({ amount: -14_000, count: 2 });
    expect(totals.get('transport')).toEqual({ amount: -2_000, count: 1 });
  });

  it('ignores deleted transactions and transfer legs', () => {
    const totals = groupActivity(
      [
        tx({ id: 't1', date: '2026-09-01', categoryId: 'groceries', amount: -10_000, deleted: true }),
        tx({ id: 't2', date: '2026-09-02', categoryId: 'groceries', amount: -5_000, transferId: 'tr-1' }),
      ],
      index,
    );
    expect(totals.get('food')).toBeUndefined();
  });

  it('skips categories that belong to no known group', () => {
    const totals = groupActivity([tx({ id: 't1', date: '2026-09-01', categoryId: 'ghost', amount: -1_000 })], index);
    expect(totals.size).toBe(0);
  });
});
