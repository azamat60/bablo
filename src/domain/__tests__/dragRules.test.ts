import { describe, expect, it } from 'vitest';
import { resolveDrop, validTargetIds, type DragItem, type DropTargetMeta } from '../dragRules';

const income: DragItem = { id: 'salary', kind: 'incomeGroup' };
const expense: DragItem = { id: 'food', kind: 'expenseGroup' };
const cash: DragItem = { id: 'cash', kind: 'account' };
const card: DragItem = { id: 'card', kind: 'account' };

const targets: DropTargetMeta[] = [income, expense, cash, card].map(({ id, kind }) => ({ id, kind }));

describe('resolveDrop', () => {
  it('turns income group onto an account into income', () => {
    expect(resolveDrop(income, cash)).toEqual({ kind: 'income', accountId: 'cash', groupId: 'salary' });
  });

  it('turns an account onto an expense group into an expense', () => {
    expect(resolveDrop(cash, expense)).toEqual({ kind: 'expense', accountId: 'cash', groupId: 'food' });
  });

  it('turns account onto account into a transfer, preserving direction', () => {
    expect(resolveDrop(cash, card)).toEqual({ kind: 'transfer', fromAccountId: 'cash', toAccountId: 'card' });
    expect(resolveDrop(card, cash)).toEqual({ kind: 'transfer', fromAccountId: 'card', toAccountId: 'cash' });
  });

  it('accepts either grab order for a category/account pairing', () => {
    expect(resolveDrop(cash, income)).toEqual(resolveDrop(income, cash));
    expect(resolveDrop(expense, cash)).toEqual(resolveDrop(cash, expense));
  });

  it('rejects meaningless pairings', () => {
    expect(resolveDrop(income, expense)).toBeNull();
    expect(resolveDrop(expense, income)).toBeNull();
    expect(resolveDrop(income, { id: 'other-income', kind: 'incomeGroup' })).toBeNull();
    expect(resolveDrop(expense, { id: 'other-expense', kind: 'expenseGroup' })).toBeNull();
  });

  it('rejects a tile dropped on itself', () => {
    expect(resolveDrop(cash, cash)).toBeNull();
  });
});

describe('validTargetIds', () => {
  it('agrees with resolveDrop for every source', () => {
    for (const source of [income, expense, cash, card]) {
      const highlighted = validTargetIds(source, targets);
      for (const target of targets) {
        expect(highlighted.has(target.id)).toBe(resolveDrop(source, target) !== null);
      }
    }
  });

  it('highlights only accounts for an income group', () => {
    expect([...validTargetIds(income, targets)].sort()).toEqual(['card', 'cash']);
  });

  it('highlights the other account and every expense group for an account', () => {
    expect([...validTargetIds(cash, targets)].sort()).toEqual(['card', 'food', 'salary']);
  });
});
