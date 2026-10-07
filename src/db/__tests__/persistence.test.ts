import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { completeOnboarding } from '../queries/onboarding';
import type { OnboardingState } from '@/features/onboarding/OnboardingPage.types';
import {
  createTransaction,
  createTransfer,
  updateTransfer,
  deleteTransaction,
  restoreTransaction,
} from '../queries/transactions';
import { exportBackupJson, importBackupJson, importCsvTransactions, restorePreviousBackup } from '../queries/backup';
import {
  importStatementRows,
  resolveRows,
  type StatementIncludeOverrides,
} from '@/features/add/StatementReviewPage.utils';
import type { StatementLine } from '@/features/add/StatementReviewPage.types';
import { validateLedger, emptyLedger } from '../../../shared/ledger';
import { appendCategoryGuess } from '../../../shared/categoryGuess';
import { deleteAccount, getAccountDeletionImpact } from '../queries/accounts';
import { createRecurring, runDueRecurring } from '../queries/recurring';
const meta = (id: string) => ({ id, updatedAt: 1, rev: 1, deleted: false });
const line = (id: string, memo = 'coffee'): StatementLine => ({
  localId: id,
  date: '2026-10-05',
  amountText: '10.00',
  kind: 'expense',
  payee: '',
  memo,
  categoryId: 'expense',
  confidence: 1,
});
beforeEach(async () => {
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
    ['KGS', 'USD'].map((currency, index) => ({
      ...meta(index ? 'usd' : 'kgs'),
      name: currency,
      currency,
      type: 'cash',
      openingBalance: 0,
      color: '#fff',
      icon: 'wallet',
      order: index,
      archived: false,
    })),
  );
  await db.rates.add({ id: 'KGS:USD', base: 'KGS', quote: 'USD', rate: 87, fetchedAt: 1 });
  await db.categoryGroups.add({
    ...meta('expenses'),
    name: 'Expenses',
    kind: 'expense',
    color: '#fff',
    order: 0,
    archived: false,
  });
  await db.categories.add({
    ...meta('expense'),
    groupId: 'expenses',
    name: 'Food',
    icon: 'food',
    color: '#fff',
    order: 0,
    archived: false,
    isSystem: false,
  });
});
const expense = (memo = 'coffee') =>
  createTransaction({
    accountId: 'kgs',
    currency: 'KGS',
    date: '2026-10-05',
    amount: -1000,
    categoryId: 'expense',
    memo,
  });
describe('atomic ledger writes', () => {
  it('converts both transfer legs and edits from either side', async () => {
    await createTransfer({
      fromAccountId: 'usd',
      toAccountId: 'kgs',
      amount: 10000,
      fromCurrency: 'USD',
      toCurrency: 'KGS',
      date: '2026-10-05',
    });
    let pair = await db.transactions.toArray();
    expect(pair.map((row) => row.amount).sort((a, b) => a - b)).toEqual([-10000, 870000]);
    const incoming = pair.find((row) => row.amount > 0)!;
    await updateTransfer(incoming.id, {
      fromAccountId: 'usd',
      toAccountId: 'kgs',
      amount: 20000,
      fromCurrency: 'USD',
      toCurrency: 'KGS',
      date: '2026-10-04',
    });
    pair = await db.transactions.toArray();
    expect(pair.map((row) => row.amount).sort((a, b) => a - b)).toEqual([-20000, 1740000]);
    expect(pair.every((row) => row.date === '2026-10-04')).toBe(true);
    await deleteTransaction(incoming.id);
    expect((await db.transactions.toArray()).every((row) => row.deleted)).toBe(true);
    await restoreTransaction(incoming.id);
    expect((await db.transactions.toArray()).every((row) => !row.deleted)).toBe(true);
  });
  it('rolls back both transfer legs if second insert fails', async () => {
    let seen = 0;
    const rejectSecond = () => {
      if (++seen === 2) throw new Error('second insert failed');
    };
    db.transactions.hook('creating', rejectSecond);
    try {
      await expect(
        createTransfer({
          fromAccountId: 'usd',
          toAccountId: 'kgs',
          amount: 100,
          fromCurrency: 'USD',
          toCurrency: 'KGS',
          date: '2026-10-05',
        }),
      ).rejects.toThrow();
    } finally {
      db.transactions.hook('creating').unsubscribe(rejectSecond);
    }
    expect(await db.transactions.count()).toBe(0);
  });
  it('rejects missing FX and invalid dates before writing', async () => {
    await db.rates.clear();
    await expect(
      createTransaction({ accountId: 'usd', currency: 'USD', date: '2026-10-05', amount: -100 }),
    ).rejects.toThrow('Нет курса');
    await expect(
      createTransaction({ accountId: 'kgs', currency: 'KGS', date: '2026-02-30', amount: -100 }),
    ).rejects.toThrow('дату');
    expect(await db.transactions.count()).toBe(0);
  });
  it('rolls back complete CSV if any row fails', async () => {
    await expect(
      importCsvTransactions('kgs', 'KGS', [
        { date: '2026-10-05', amount: -100, memo: 'a', categoryName: 'Food' },
        { date: '2026-10-05', amount: -Number.MAX_SAFE_INTEGER, memo: 'b', categoryName: 'Food' },
      ]),
    ).rejects.toThrow();
    expect(await db.transactions.count()).toBe(0);
  });
  it('rechecks statement duplicates inside transaction', async () => {
    const rows = resolveRows([line('one')], [], {}, { accountId: 'kgs', currency: 'KGS' });
    await expense();
    await expect(importStatementRows({ rows, accountId: 'kgs', currency: 'KGS', groups: [] })).rejects.toThrow('дубли');
    expect(await db.transactions.count()).toBe(1);
  });
  it('persists guessed category notes and detects reimport even when AI changes its confidence', async () => {
    const memo = appendCategoryGuess('coffee', 'Expenses / Food', 0.65, 'Название похоже на кафе');
    const item = { ...line('one', memo), confidence: 0.65 };
    const reviewContext = { accountId: 'kgs', currency: 'KGS' };
    const rows = resolveRows([item], [], {}, reviewContext);
    await importStatementRows({ rows, accountId: 'kgs', currency: 'KGS', groups: [] });
    const saved = (await db.transactions.toArray())[0]!;
    expect(saved.memo).toBe(memo);
    expect(saved.aiConfidence).toBe(0.65);
    expect(saved.categoryId).toBe('expense');
    expect(await exportBackupJson()).toContain('Confidence level: 65%');
    const changed = {
      ...item,
      memo: appendCategoryGuess('coffee', 'Expenses / Food', 0.55, 'Другое объяснение'),
      confidence: 0.55,
    };
    expect(resolveRows([changed], [saved], {}, reviewContext)[0]?.include).toBe(false);
    expect(resolveRows([line('old')], [saved], {}, reviewContext)[0]?.duplicate).toBe(true);
    expect(resolveRows([line('different', 'another purchase')], [saved], {}, reviewContext)[0]?.duplicate).toBe(false);
  });
  it('detects internal duplicates and expires edited approval', () => {
    const rows = resolveRows([line('one'), line('two')], [], {}, { accountId: 'kgs', currency: 'KGS' });
    expect(rows.map((row) => row.include)).toEqual([true, false]);
    const choice: StatementIncludeOverrides = {
      two: { include: true, fingerprint: rows[1]!.fingerprint, confirmedDuplicate: true },
    };
    expect(resolveRows([line('one'), line('two')], [], choice, { accountId: 'kgs', currency: 'KGS' })[1]!.include).toBe(
      true,
    );
    const changed = line('two');
    changed.amountText = '20';
    const edited = resolveRows([line('one'), changed, line('third', 'other')], [], choice, {
      accountId: 'usd',
      currency: 'USD',
    });
    expect(edited[1]!.duplicateConfirmed).toBe(false);
  });
  it('rolls back statement payees if transaction fails', async () => {
    const item = line('one');
    item.payee = 'New payee';
    const rows = resolveRows([item], [], {}, { accountId: 'kgs', currency: 'KGS' });
    const fail = () => {
      throw new Error('write failed');
    };
    db.transactions.hook('creating', fail);
    try {
      await expect(importStatementRows({ rows, accountId: 'kgs', currency: 'KGS', groups: [] })).rejects.toThrow(
        'write failed',
      );
    } finally {
      db.transactions.hook('creating').unsubscribe(fail);
    }
    expect(await db.payees.count()).toBe(0);
    expect(await db.transactions.count()).toBe(0);
  });
  it('keeps data when backup validation fails', async () => {
    await expense();
    const before = await exportBackupJson();
    const invalid = JSON.parse(before) as { tables: { transactions: Record<string, unknown>[] } };
    invalid.tables.transactions[0]!.accountId = 'missing';
    await expect(importBackupJson(JSON.stringify(invalid))).rejects.toThrow();
    expect(await db.transactions.count()).toBe(1);
  });
  it('restores full snapshot with blobs and offers undo', async () => {
    const id = await expense();
    await db.transactions.update(id, { attachmentIds: ['photo'] });
    await db.attachments.add({
      ...meta('photo'),
      txId: id,
      mimeType: 'image/png',
      blob: new Blob(['image'], { type: 'image/png' }),
    });
    const snapshot = await exportBackupJson();
    await expense('later');
    await importBackupJson(snapshot);
    expect(await db.transactions.count()).toBe(1);
    expect(await (await db.attachments.get('photo'))!.blob.text()).toBe('image');
    await restorePreviousBackup();
    expect(await db.transactions.count()).toBe(2);
  });
  it('validates empty account and complete current snapshot', async () => {
    expect(validateLedger(emptyLedger())).toEqual(emptyLedger());
    const snapshot: unknown = JSON.parse(await exportBackupJson());
    expect(snapshot).toBeTruthy();
  });
});

describe('complete account deletion', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T06:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('deletes related records and both transfer legs, preserving other accounts and savings', async () => {
    const ownId = await expense();
    const otherId = await createTransaction({
      accountId: 'usd',
      currency: 'USD',
      date: '2026-10-05',
      amount: -100,
      categoryId: 'expense',
    });
    await createTransfer({
      fromAccountId: 'usd',
      toAccountId: 'kgs',
      amount: 100,
      fromCurrency: 'USD',
      toCurrency: 'KGS',
      date: '2026-10-05',
    });
    const ownRecurringId = await createRecurring({
      accountId: 'kgs',
      currency: 'KGS',
      amount: -100,
      categoryId: 'expense',
      frequency: 'monthly',
      interval: 1,
      nextRun: '2026-10-05',
      autoPost: true,
    });
    const otherRecurringId = await createRecurring({
      accountId: 'usd',
      currency: 'USD',
      amount: -100,
      categoryId: 'expense',
      frequency: 'monthly',
      interval: 1,
      nextRun: '2099-10-05',
      autoPost: true,
    });
    await db.goals.add({
      ...meta('goal'),
      name: 'Trip',
      icon: 'wallet',
      color: '#fff',
      targetAmount: 10000,
      accountId: 'kgs',
      order: 0,
      archived: false,
    });
    await db.goalContributions.add({ ...meta('contribution'), goalId: 'goal', amount: 100, date: '2026-10-05' });
    await db.attachments.bulkAdd(
      [ownId, otherId].map((txId) => ({
        ...meta(`photo-${txId}`),
        txId,
        mimeType: 'image/png',
        blob: new Blob(['image']),
      })),
    );

    expect(await getAccountDeletionImpact('kgs')).toEqual({
      transactionCount: 2,
      transferCount: 1,
      recurringCount: 1,
      goalCount: 1,
    });
    await deleteAccount('kgs');

    expect(await db.accounts.get('kgs')).toMatchObject({ deleted: true, rev: 2 });
    expect(await db.accounts.get('usd')).toMatchObject({ deleted: false, rev: 1 });
    const transactions = await db.transactions.toArray();
    expect(transactions.filter((row) => !row.deleted).map((row) => row.id)).toEqual([otherId]);
    expect(transactions.filter((row) => row.transferId).every((row) => row.deleted)).toBe(true);
    expect(await db.attachments.get(`photo-${ownId}`)).toMatchObject({ deleted: true, rev: 2 });
    expect(await db.attachments.get(`photo-${otherId}`)).toMatchObject({ deleted: false });
    expect(await db.recurring.get(ownRecurringId)).toMatchObject({ deleted: true, active: false, rev: 2 });
    expect(await db.recurring.get(otherRecurringId)).toMatchObject({ deleted: false, active: true, rev: 1 });
    expect(await db.goals.get('goal')).toMatchObject({ deleted: false, accountId: undefined, rev: 2 });
    expect(await db.goalContributions.get('contribution')).toMatchObject({ deleted: false, amount: 100 });
    expect(await runDueRecurring()).toBe(0);
    await expect(restoreTransaction(ownId)).rejects.toThrow('доступный счёт');
    const backup: unknown = JSON.parse(await exportBackupJson());
    expect(() => validateLedger(backup)).not.toThrow();
  });

  it('rolls back the full deletion if any related write fails', async () => {
    const id = await expense();
    const before = JSON.parse(await exportBackupJson()) as { tables: unknown; attachments: unknown };
    const fail = () => {
      throw new Error('account write failed');
    };
    db.accounts.hook('updating', fail);
    try {
      await expect(deleteAccount('kgs')).rejects.toThrow('account write failed');
    } finally {
      db.accounts.hook('updating').unsubscribe(fail);
    }
    expect(await db.transactions.get(id)).toMatchObject({ deleted: false, rev: 1 });
    const after = JSON.parse(await exportBackupJson()) as unknown;
    expect(after).toMatchObject({ tables: before.tables, attachments: before.attachments });
  });

  it('deletes the last empty account and tolerates repeated or missing deletes', async () => {
    await deleteAccount('kgs');
    await deleteAccount('usd');
    await deleteAccount('missing');
    await deleteAccount('usd');
    expect((await db.accounts.toArray()).every((row) => row.deleted && row.rev === 2)).toBe(true);
    expect(await getAccountDeletionImpact('usd')).toEqual({
      transactionCount: 0,
      transferCount: 0,
      recurringCount: 0,
      goalCount: 0,
    });
    const backup: unknown = JSON.parse(await exportBackupJson());
    expect(() => validateLedger(backup)).not.toThrow();
  });

  it('keeps previously deleted transfers deleted and prevents undo through the other account', async () => {
    await createTransfer({
      fromAccountId: 'usd',
      toAccountId: 'kgs',
      amount: 100,
      fromCurrency: 'USD',
      toCurrency: 'KGS',
      date: '2026-10-05',
    });
    const outgoing = (await db.transactions.where('accountId').equals('usd').first())!;
    await deleteTransaction(outgoing.id);
    expect((await getAccountDeletionImpact('kgs')).transactionCount).toBe(0);
    await deleteAccount('kgs');
    await expect(restoreTransaction(outgoing.id)).rejects.toThrow('доступный счёт');
    expect((await db.transactions.toArray()).every((row) => row.deleted && row.rev === 2)).toBe(true);
  });

  it('rechecks a recurring snapshot after an account was deleted', async () => {
    await createRecurring({
      accountId: 'kgs',
      currency: 'KGS',
      amount: -100,
      categoryId: 'expense',
      frequency: 'monthly',
      interval: 1,
      nextRun: '2026-10-05',
      autoPost: true,
    });
    const stale = await db.recurring.toArray();
    await deleteAccount('kgs');
    const snapshot = vi.spyOn(db.recurring, 'toArray').mockResolvedValueOnce(stale);
    try {
      expect(await runDueRecurring()).toBe(0);
    } finally {
      snapshot.mockRestore();
    }
    expect(await db.transactions.count()).toBe(0);
    expect(await db.recurring.get(stale[0]!.id)).toMatchObject({ deleted: true, active: false });
  });

  it('still posts and advances an active recurring transaction', async () => {
    const id = await createRecurring({
      accountId: 'kgs',
      currency: 'KGS',
      amount: -100,
      categoryId: 'expense',
      frequency: 'monthly',
      interval: 1,
      nextRun: '2026-10-05',
      autoPost: true,
    });
    expect(await runDueRecurring()).toBe(1);
    expect(await db.transactions.toArray()).toMatchObject([{ accountId: 'kgs', amount: -100, deleted: false }]);
    expect(await db.recurring.get(id)).toMatchObject({ nextRun: '2026-11-05', active: true, deleted: false });
    expect(await runDueRecurring()).toBe(0);
  });
});

describe('onboarding transaction', () => {
  const state: OnboardingState = {
    step: 4,
    locale: 'ru',
    currency: 'KGS',
    preset: 'empty',
    accounts: [{ localId: 'draft', name: 'Наличные', type: 'cash', openingBalance: '-0.01' }],
  };
  beforeEach(async () => {
    await db.accounts.clear();
    await db.categories.clear();
    await db.categoryGroups.clear();
    await db.settings.update('singleton', { onboardingComplete: false });
  });
  it('finishes once even with concurrent calls', async () => {
    await Promise.all([completeOnboarding(state), completeOnboarding(state)]);
    expect(await db.accounts.count()).toBe(1);
    expect((await db.accounts.toArray())[0]?.openingBalance).toBe(-1);
    expect((await db.settings.get('singleton'))?.onboardingComplete).toBe(true);
  });
  it('rolls back categories, accounts and completion on write failure', async () => {
    const fail = () => {
      throw new Error('disk full');
    };
    db.accounts.hook('creating', fail);
    try {
      await expect(completeOnboarding(state)).rejects.toThrow('disk full');
    } finally {
      db.accounts.hook('creating').unsubscribe(fail);
    }
    expect(await db.accounts.count()).toBe(0);
    expect(await db.categories.count()).toBe(0);
    expect((await db.settings.get('singleton'))?.onboardingComplete).toBe(false);
  });
  it('rejects invalid input and aggregate precision overflow without partial data', async () => {
    await expect(
      completeOnboarding({ ...state, accounts: [{ ...state.accounts[0]!, openingBalance: 'abc' }] }),
    ).rejects.toThrow('балансы');
    await expect(
      completeOnboarding({
        ...state,
        accounts: ['a', 'b'].map((localId) => ({
          ...state.accounts[0]!,
          localId,
          openingBalance: '90071992547409.91',
        })),
      }),
    ).rejects.toThrow();
    expect(await db.accounts.count()).toBe(0);
    expect(await db.categories.count()).toBe(0);
    expect((await db.settings.get('singleton'))?.onboardingComplete).toBe(false);
  });
});
