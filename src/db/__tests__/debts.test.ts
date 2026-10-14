import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { saveDebtPerson } from '../queries/debts';
import { deleteAccount } from '../queries/accounts';
import {
  createTransaction,
  createTransfer,
  deleteTransaction,
  restoreTransaction,
  updateTransfer,
} from '../queries/transactions';
import { exportBackupJson, importBackupJson } from '../queries/backup';
import { readLedger, replaceLedger } from '../cloud';
import { debtHistory, debtTransferDraft, summarizeDebts } from '@/domain/debts';
import { incomeExpenseTotals, netWorthSeries } from '@/domain/reports';
import { netWorthBreakdown } from '@/domain/accounts';
import { validateLedger } from '../../../shared/ledger';
import type { Account } from '../types';

const meta = (id: string) => ({ id, updatedAt: 1, rev: 1, deleted: false });
const wallet: Account = {
  ...meta('wallet'),
  name: 'Cash',
  type: 'cash',
  currency: 'KGS',
  openingBalance: 1000000,
  color: '#fff',
  icon: 'wallet',
  order: 0,
  archived: false,
};

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
  await db.accounts.add(wallet);
  await db.rates.add({ id: 'KGS:USD', base: 'KGS', quote: 'USD', rate: 87, fetchedAt: 1 });
});

async function transfer(personId: string, amount: number, direction: 'in' | 'out', date = '2026-10-13') {
  const person = (await db.accounts.get(personId))!;
  const draft = debtTransferDraft(personId, wallet.id, direction);
  await createTransfer({
    fromAccountId: draft.accountId!,
    toAccountId: draft.toAccountId!,
    fromCurrency: direction === 'out' ? wallet.currency : person.currency,
    toCurrency: direction === 'out' ? person.currency : wallet.currency,
    amount,
    date,
  });
}

async function balance(id: string) {
  const account = (await db.accounts.get(id))!;
  const rows = await db.transactions.where('accountId').equals(id).toArray();
  return account.openingBalance + rows.filter((tx) => !tx.deleted).reduce((sum, tx) => sum + tx.amount, 0);
}

describe('personal debts', () => {
  it('records an old debt without inventing wallet movements and edits its starting amount', async () => {
    const id = await saveDebtPerson({ name: ' Friend ', currency: 'KGS', openingBalance: -1000000 });
    expect(await db.accounts.get(id)).toMatchObject({ name: 'Friend', type: 'debt', openingBalance: -1000000 });
    expect(await db.transactions.count()).toBe(0);
    expect(await balance(wallet.id)).toBe(1000000);
    await saveDebtPerson({ name: 'Friend renamed', currency: 'KGS', openingBalance: -900000 }, id);
    expect(await balance(id)).toBe(-900000);
    expect(await balance(wallet.id)).toBe(1000000);
  });

  it('borrows and repays atomically while keeping loans out of income and expenses', async () => {
    const id = await saveDebtPerson({ name: 'Friend', currency: 'KGS', openingBalance: -100000 });
    await transfer(id, 50000, 'in', '2026-10-12');
    await transfer(id, 40000, 'out');
    expect(await balance(wallet.id)).toBe(1010000);
    expect(await balance(id)).toBe(-110000);
    const transactions = await db.transactions.toArray();
    expect(incomeExpenseTotals(transactions, '2026-10')).toEqual({ income: 0, expense: 0 });
    const accounts = await db.accounts.toArray();
    const balances = new Map([
      [wallet.id, await balance(wallet.id)],
      [id, await balance(id)],
    ]);
    expect(netWorthBreakdown(accounts, balances)).toEqual({ assets: 1010000, liabilities: 110000, netWorth: 900000 });
    expect(netWorthSeries(accounts, transactions, 1, '2026-10')).toEqual([{ month: '2026-10', netWorth: 900000 }]);
    const own = transactions.filter((tx) => tx.accountId === id);
    expect(debtHistory(own, -100000).map((row) => row.balance)).toEqual([-110000, -150000]);
    validateLedger(await readLedger());
  });

  it('lends, receives repayment, settles, and switches who owes whom', async () => {
    const id = await saveDebtPerson({ name: 'Friend', currency: 'KGS', openingBalance: 0 });
    await transfer(id, 200000, 'out');
    expect(await balance(id)).toBe(200000);
    await transfer(id, 200000, 'in');
    expect(await balance(id)).toBe(0);
    expect(await balance(wallet.id)).toBe(1000000);
    await transfer(id, 30000, 'in');
    expect(await balance(id)).toBe(-30000);
    expect(await balance(wallet.id)).toBe(1030000);
  });

  it('edits, deletes, and restores both sides through the person history', async () => {
    const id = await saveDebtPerson({ name: 'Friend', currency: 'KGS', openingBalance: 0 });
    await transfer(id, 20000, 'out');
    const own = (await db.transactions.where('accountId').equals(id).first())!;
    await updateTransfer(own.id, {
      fromAccountId: wallet.id,
      toAccountId: id,
      fromCurrency: 'KGS',
      toCurrency: 'KGS',
      amount: 30000,
      date: '2026-10-10',
    });
    expect(await balance(id)).toBe(30000);
    expect(await balance(wallet.id)).toBe(970000);
    await deleteTransaction(own.id);
    expect(await balance(id)).toBe(0);
    expect(await balance(wallet.id)).toBe(1000000);
    await restoreTransaction(own.id);
    expect(await balance(id)).toBe(30000);
    expect(await balance(wallet.id)).toBe(970000);
  });

  it('converts wallet and person currencies and rejects missing rates without partial writes', async () => {
    const id = await saveDebtPerson({ name: 'USD friend', currency: 'USD', openingBalance: 0 });
    await transfer(id, 870000, 'out');
    expect(await balance(id)).toBe(10000);
    expect(await balance(wallet.id)).toBe(130000);
    await db.rates.clear();
    await expect(transfer(id, 100, 'in')).rejects.toThrow('Нет курса');
    expect(await db.transactions.count()).toBe(2);
  });

  it('preserves people, initial debts, and paired history across backup and cloud round trips', async () => {
    const id = await saveDebtPerson({ name: 'Friend', currency: 'KGS', openingBalance: 20000 });
    await transfer(id, 10000, 'in');
    const ledger = await readLedger();
    expect(() => validateLedger(ledger)).not.toThrow();
    const backup = await exportBackupJson();
    await db.accounts.clear();
    await db.transactions.clear();
    await importBackupJson(backup);
    expect(await balance(id)).toBe(10000);
    await replaceLedger(ledger);
    expect(await readLedger()).toEqual(ledger);
    expect(await balance(wallet.id)).toBe(1010000);
  });

  it('deletes only the selected person and linked transfers, and prevents restoring orphaned debts', async () => {
    const id = await saveDebtPerson({ name: 'Friend', currency: 'KGS', openingBalance: 100 });
    const other = await saveDebtPerson({ name: 'Other', currency: 'KGS', openingBalance: -500 });
    await transfer(id, 10000, 'out');
    const own = (await db.transactions.where('accountId').equals(id).first())!;
    await deleteAccount(id);
    expect(await db.accounts.get(id)).toMatchObject({ deleted: true });
    expect(await balance(wallet.id)).toBe(1000000);
    expect(await db.accounts.get(other)).toMatchObject({ deleted: false, openingBalance: -500 });
    await expect(restoreTransaction(own.id)).rejects.toThrow('доступный счёт');
    validateLedger(await readLedger());
  });

  it('rejects invalid person data, overflowing totals, standalone expenses, and transfers between people', async () => {
    await expect(saveDebtPerson({ name: ' ', currency: 'KGS', openingBalance: 0 })).rejects.toThrow();
    await expect(
      saveDebtPerson({ name: 'Huge', currency: 'KGS', openingBalance: Number.MAX_SAFE_INTEGER }),
    ).rejects.toThrow();
    expect(await db.accounts.count()).toBe(1);
    const id = await saveDebtPerson({ name: 'Friend', currency: 'KGS', openingBalance: 0 });
    const other = await saveDebtPerson({ name: 'Other', currency: 'KGS', openingBalance: 0 });
    await expect(saveDebtPerson({ name: 'Friend', currency: 'USD', openingBalance: 0 }, id)).rejects.toThrow('Валюту');
    await expect(
      createTransaction({ accountId: id, currency: 'KGS', date: '2026-10-13', amount: 100 }),
    ).rejects.toThrow('переводами');
    await expect(
      createTransfer({
        fromAccountId: id,
        toAccountId: other,
        fromCurrency: 'KGS',
        toCurrency: 'KGS',
        amount: 100,
        date: '2026-10-13',
      }),
    ).rejects.toThrow('кошелёк');
    expect(await db.transactions.count()).toBe(0);
  });

  it('filters using native debt signs and exposes incomplete mixed-currency totals', async () => {
    const owed = await saveDebtPerson({ name: 'Owed', currency: 'KGS', openingBalance: -100 });
    const receivable = await saveDebtPerson({ name: 'Receivable', currency: 'USD', openingBalance: 200 });
    const settled = await saveDebtPerson({ name: 'Settled', currency: 'KGS', openingBalance: 0 });
    const people = (await db.accounts.toArray()).filter((account) => account.type === 'debt');
    const native = new Map([
      [owed, -100],
      [receivable, 200],
      [settled, 0],
    ]);
    const converted = new Map([
      [owed, -100],
      [settled, 0],
    ]);
    expect(summarizeDebts(people, native, converted, 'owed')).toMatchObject({ total: 100, missing: [] });
    expect(summarizeDebts(people, native, converted, 'receivable')).toMatchObject({ total: 0, missing: ['USD'] });
    expect(summarizeDebts(people, native, converted).people).toHaveLength(3);
  });
});
