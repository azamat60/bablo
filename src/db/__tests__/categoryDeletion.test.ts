import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { deleteCategory, deleteCategoryGroup, getCategoryDeletionImpact } from '../queries/categoryDeletion';
import {
  createTransaction,
  createTransfer,
  restoreTransaction,
  type NewTransactionInput,
} from '../queries/transactions';
import { createRecurring, runDueRecurring } from '../queries/recurring';
import { setAssigned } from '../queries/budgets';
import { exportBackupJson } from '../queries/backup';
import { addRecommendedCategories, recommendedCategories } from '../queries/categoryRecommendations';
import { buildMonthBudgetIndex, categoryAssignedInMonth, categoryAssignedThroughMonth } from '@/domain/budget';
import { validateLedger } from '../../../shared/ledger';

const meta = (id: string) => ({ id, updatedAt: 1, rev: 1, deleted: false });
const entry = (categoryId: string, amount: number, patch: Partial<NewTransactionInput> = {}) =>
  createTransaction({
    accountId: 'cash',
    currency: 'KGS',
    date: '2026-10-05',
    categoryId,
    amount,
    ...patch,
  });
const schedule = (categoryId: string, amount: number) =>
  createRecurring({
    accountId: 'cash',
    currency: 'KGS',
    categoryId,
    amount,
    frequency: 'monthly',
    interval: 1,
    nextRun: '2026-10-05',
    autoPost: true,
  });
const snapshot = async () => JSON.parse(await exportBackupJson()) as { tables: unknown; attachments: unknown };

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T06:00:00Z'));
  await db.delete();
  await db.open();
  await db.settings.add({
    id: 'singleton',
    baseCurrency: 'KGS',
    theme: 'dark',
    aiModel: 'test',
    onboardingComplete: true,
    flags: {},
    firstDayOfMonth: 1,
  });
  await db.accounts.bulkAdd(
    ['cash', 'card'].map((id, order) => ({
      ...meta(id),
      name: id,
      type: 'cash' as const,
      currency: 'KGS',
      openingBalance: 100000,
      color: '#fff',
      icon: 'wallet',
      order,
      archived: false,
    })),
  );
  await db.categoryGroups.bulkAdd(
    (
      [
        ['food', 'Food', 'expense'],
        ['income', 'Income', 'income'],
        ['transport', 'Transport', 'expense'],
      ] as const
    ).map(([id, name, kind], order) => ({ ...meta(id), name, kind, color: '#fff', order, archived: false })),
  );
  await db.categories.bulkAdd(
    [
      ['groceries', 'food', 'Groceries'],
      ['coffee', 'food', 'Coffee'],
      ['salary', 'income', 'Salary'],
      ['fuel', 'transport', 'Fuel'],
    ].map(([id, groupId, name], order) => ({
      ...meta(id!),
      groupId: groupId!,
      name: name!,
      icon: 'coffee',
      color: '#fff',
      order,
      archived: false,
      isSystem: false,
    })),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('category deletion', () => {
  it('deletes the entire group and its records while preserving other categories and accounts', async () => {
    const groceryId = await entry('groceries', -1000);
    await entry('coffee', -2000);
    const salaryId = await entry('salary', 3000);
    const fuelId = await entry('fuel', -4000);
    const splitId = await entry('groceries', -500, {
      splits: [
        { categoryId: 'groceries', amount: -200 },
        { categoryId: 'fuel', amount: -300 },
      ],
    });
    await createTransfer({
      fromAccountId: 'cash',
      toAccountId: 'card',
      amount: 100,
      fromCurrency: 'KGS',
      toCurrency: 'KGS',
      date: '2026-10-05',
    });
    const outgoing = (await db.transactions.filter((row) => Boolean(row.transferId) && row.amount < 0).first())!;
    await db.transactions.update(outgoing.id, { categoryId: 'coffee' });
    const recurringId = await schedule('coffee', -100);
    await setAssigned('2026-10', 'groceries', 5000);
    await setAssigned('2026-10', 'coffee', 2000);
    await setAssigned('2026-10', 'fuel', 1000);
    await db.payees.bulkAdd(
      ['groceries', 'salary'].map((categoryId) => ({
        ...meta(`payee-${categoryId}`),
        name: categoryId,
        defaultCategoryId: categoryId,
        aliases: [],
      })),
    );
    await db.attachments.bulkAdd(
      [groceryId, splitId, salaryId].map((txId) => ({
        ...meta(`photo-${txId}`),
        txId,
        mimeType: 'image/png',
        blob: new Blob(['test']),
      })),
    );
    expect(await getCategoryDeletionImpact(['groceries', 'coffee'])).toEqual({
      transactionCount: 4,
      transferCount: 1,
      splitCount: 1,
      recurringCount: 1,
      budgetCount: 2,
      categoryCount: 2,
    });

    await deleteCategoryGroup('food');

    expect(await db.categoryGroups.get('food')).toMatchObject({ deleted: true, rev: 2 });
    for (const id of ['groceries', 'coffee'])
      expect(await db.categories.get(id)).toMatchObject({ deleted: true, rev: 2 });
    const active = await db.transactions.filter((row) => !row.deleted).toArray();
    expect(active.map((row) => row.id).sort()).toEqual([salaryId, fuelId].sort());
    expect(active.reduce((balance, row) => balance + row.amount, 100000)).toBe(99000);
    expect((await db.transactions.filter((row) => Boolean(row.transferId)).toArray()).every((row) => row.deleted)).toBe(
      true,
    );
    expect((await db.accounts.toArray()).every((row) => !row.deleted && row.rev === 1)).toBe(true);
    expect(await db.recurring.get(recurringId)).toMatchObject({ deleted: true, active: false, rev: 2 });
    expect(await runDueRecurring()).toBe(0);
    expect(await db.payees.get('payee-groceries')).toMatchObject({ defaultCategoryId: undefined, deleted: false });
    expect(await db.payees.get('payee-salary')).toMatchObject({ defaultCategoryId: 'salary', rev: 1 });
    expect(await db.attachments.get(`photo-${groceryId}`)).toMatchObject({ deleted: true });
    expect(await db.attachments.get(`photo-${splitId}`)).toMatchObject({ deleted: true });
    expect(await db.attachments.get(`photo-${salaryId}`)).toMatchObject({ deleted: false });
    const budgets = await db.budgets.toArray();
    expect(categoryAssignedInMonth(budgets, 'groceries', '2026-10')).toBe(0);
    expect(categoryAssignedThroughMonth(budgets, 'coffee', '2026-10')).toBe(0);
    expect(buildMonthBudgetIndex(budgets, active, '2026-10').get('fuel')?.assigned).toBe(1000);
    await expect(setAssigned('2026-10', 'groceries', 1)).rejects.toThrow('доступную категорию');
    await expect(restoreTransaction(splitId)).rejects.toThrow('доступную категорию');
    const backup = await snapshot();
    expect(() => validateLedger(backup)).not.toThrow();

    const missing = recommendedCategories(
      'ru',
      await db.categoryGroups.toArray(),
      await db.categories.toArray(),
    ).filter((item) => ['Groceries', 'Coffee'].includes((JSON.parse(item.id) as [string, string])[1]));
    expect(
      await addRecommendedCategories(
        missing.map((item) => item.id),
        'ru',
      ),
    ).toBe(2);
    expect(await db.transactions.filter((row) => !row.deleted).count()).toBe(2);
    expect(await db.categories.get('groceries')).toMatchObject({ deleted: true });
    expect(await db.categoryGroups.get('food')).toMatchObject({ deleted: true });
  });

  it('deletes a subcategory and full split records without deleting siblings', async () => {
    const removed = await entry('groceries', -1000);
    const kept = await entry('coffee', -2000);
    const splitId = await entry('coffee', -500, {
      splits: [
        { categoryId: 'coffee', amount: -300 },
        { categoryId: 'groceries', amount: -200 },
      ],
    });
    await deleteCategory('groceries');
    expect(await db.transactions.get(removed)).toMatchObject({ deleted: true });
    expect(await db.transactions.get(splitId)).toMatchObject({ deleted: true });
    expect(await db.transactions.get(kept)).toMatchObject({ deleted: false, rev: 1 });
    expect(await db.categoryGroups.get('food')).toMatchObject({ deleted: false, rev: 1 });
    expect(await db.categories.get('coffee')).toMatchObject({ deleted: false, rev: 1 });
  });

  it('deletes income records and recurring income along with their category', async () => {
    const salaryId = await entry('salary', 3000);
    const expenseId = await entry('fuel', -100);
    const recurringId = await schedule('salary', 2000);
    await deleteCategoryGroup('income');
    expect(await db.transactions.get(salaryId)).toMatchObject({ deleted: true });
    expect(await db.transactions.get(expenseId)).toMatchObject({ deleted: false });
    expect(await db.recurring.get(recurringId)).toMatchObject({ deleted: true, active: false });
    expect(await runDueRecurring()).toBe(0);
  });

  it('rolls back all affected tables if the group write fails', async () => {
    const id = await entry('groceries', -1000);
    await schedule('groceries', -100);
    await setAssigned('2026-10', 'groceries', 2000);
    await db.attachments.add({ ...meta('photo'), txId: id, mimeType: 'image/png', blob: new Blob(['test']) });
    await db.payees.add({ ...meta('payee'), name: 'Store', defaultCategoryId: 'groceries', aliases: [] });
    const before = await snapshot();
    const fail = () => {
      throw new Error('group write failed');
    };
    db.categoryGroups.hook('updating', fail);
    try {
      await expect(deleteCategoryGroup('food')).rejects.toThrow('group write failed');
    } finally {
      db.categoryGroups.hook('updating').unsubscribe(fail);
    }
    expect(await snapshot()).toMatchObject({ tables: before.tables, attachments: before.attachments });
  });

  it('does not post a stale recurring snapshot after category deletion', async () => {
    const id = await schedule('groceries', -100);
    const stale = await db.recurring.toArray();
    await deleteCategory('groceries');
    vi.spyOn(db.recurring, 'toArray').mockResolvedValueOnce(stale);
    expect(await runDueRecurring()).toBe(0);
    expect(await db.transactions.count()).toBe(0);
    expect(await db.recurring.get(id)).toMatchObject({ deleted: true, active: false });
  });

  it('handles system categories, empty groups and repeated or missing deletions', async () => {
    await db.categories.update('groceries', { isSystem: true });
    await deleteCategory('groceries');
    await deleteCategory('groceries');
    await deleteCategory('missing');
    await deleteCategory('coffee');
    await deleteCategoryGroup('food');
    await deleteCategoryGroup('food');
    await deleteCategoryGroup('missing');
    expect(await db.categories.get('groceries')).toMatchObject({ deleted: true, rev: 2 });
    expect(await db.categoryGroups.get('food')).toMatchObject({ deleted: true, rev: 2 });
    const backup = await snapshot();
    expect(() => validateLedger(backup)).not.toThrow();
  });
});
