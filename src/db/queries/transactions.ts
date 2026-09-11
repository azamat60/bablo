import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/db/db';
import { newMeta, touchMeta } from '@/db/meta';
import { currentRate } from './rates';
import { buildRateTable, toBase } from '@/domain/rates';
import type { Transaction, TransactionSource, TransactionSplit } from '@/db/types';

export type TransactionFilter = {
  accountId?: string;
};

export function useTransactions(filter: TransactionFilter = {}): Transaction[] {
  return (
    useLiveQuery(async () => {
      const all = filter.accountId
        ? await db.transactions.where('accountId').equals(filter.accountId).toArray()
        : await db.transactions.toArray();
      return all.filter((tx) => !tx.deleted).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
    }, [filter.accountId]) ?? []
  );
}

/**
 * Transactions whose date falls in [from, to], both inclusive, both 'yyyy-MM-dd'.
 *
 * Uses the `date` index instead of reading the whole table, which is what
 * `useTransactions` does. Screens scoped to a period should prefer this.
 */
export function useTransactionsInRange(from: string, to: string): Transaction[] {
  return (
    useLiveQuery(async () => {
      const all = await db.transactions.where('date').between(from, to, true, true).toArray();
      return all.filter((tx) => !tx.deleted).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
    }, [from, to]) ?? []
  );
}

export function useAccountBalance(accountId: string): number {
  return (
    useLiveQuery(async () => {
      const account = await db.accounts.get(accountId);
      if (!account) return 0;
      const txs = await db.transactions.where('accountId').equals(accountId).toArray();
      const sum = txs.filter((tx) => !tx.deleted).reduce((total, tx) => total + tx.amount, 0);
      return account.openingBalance + sum;
    }, [accountId]) ?? 0
  );
}

export function useAccountBalances(): Map<string, number> {
  return (
    useLiveQuery(async () => {
      const accounts = await db.accounts.toArray();
      const txs = await db.transactions.toArray();
      const activeTxs = txs.filter((tx) => !tx.deleted);
      const balances = new Map<string, number>();
      for (const account of accounts) {
        const sum = activeTxs.filter((tx) => tx.accountId === account.id).reduce((total, tx) => total + tx.amount, 0);
        balances.set(account.id, account.openingBalance + sum);
      }
      return balances;
    }, []) ?? new Map<string, number>()
  );
}

/**
 * Account balances converted into the base currency.
 *
 * Kept separate from useAccountBalances, which stays in each account's own
 * currency: a row shows a native figure, a total must be converted.
 */
export function useBalancesInBase(): Map<string, number> {
  return (
    useLiveQuery(async () => {
      const [accounts, txs, settings, rateRows] = await Promise.all([
        db.accounts.toArray(),
        db.transactions.toArray(),
        db.settings.get('singleton'),
        db.rates.toArray(),
      ]);
      const base = settings?.baseCurrency ?? 'USD';
      const table = buildRateTable(rateRows, base);
      const activeTxs = txs.filter((tx) => !tx.deleted);

      const balances = new Map<string, number>();
      for (const account of accounts) {
        const native = activeTxs
          .filter((tx) => tx.accountId === account.id)
          .reduce((total, tx) => total + tx.amount, 0);
        const converted = toBase(account.openingBalance + native, account.currency, table);
        // An unconvertible account is omitted rather than counted at parity,
        // so a total is either right or visibly incomplete.
        if (converted !== undefined) balances.set(account.id, converted);
      }
      return balances;
    }, []) ?? new Map<string, number>()
  );
}

export function useNetWorth(): number {
  return (
    useLiveQuery(async () => {
      const accounts = await db.accounts.toArray();
      const txs = await db.transactions.toArray();
      const activeTxs = txs.filter((tx) => !tx.deleted);
      return accounts.reduce((total, account) => {
        const sum = activeTxs.filter((tx) => tx.accountId === account.id).reduce((accSum, tx) => accSum + tx.amount, 0);
        return total + account.openingBalance + sum;
      }, 0);
    }, []) ?? 0
  );
}

export type NewTransactionInput = {
  accountId: string;
  date: string;
  amount: number;
  currency: string;
  categoryId?: string;
  payeeId?: string;
  memo?: string;
  splits?: TransactionSplit[];
  source?: TransactionSource;
};

export async function createTransaction(input: NewTransactionInput): Promise<string> {
  // Stamped at write time so historical figures are not rewritten when rates
  // move later.
  const base = (await db.settings.get('singleton'))?.baseCurrency ?? input.currency;
  const transaction: Transaction = {
    ...newMeta(),
    accountId: input.accountId,
    date: input.date,
    amount: input.amount,
    currency: input.currency,
    rate: await currentRate(base, input.currency),
    categoryId: input.categoryId,
    payeeId: input.payeeId,
    memo: input.memo,
    cleared: true,
    splits: input.splits,
    tags: [],
    attachmentIds: [],
    source: input.source ?? 'manual',
  };
  await db.transactions.add(transaction);
  return transaction.id;
}

export type NewTransferInput = {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  date: string;
  memo?: string;
};

export async function createTransfer(input: NewTransferInput): Promise<void> {
  const transferId = uuidv4();
  const now = Date.now();
  const base = (await db.settings.get('singleton'))?.baseCurrency ?? input.fromCurrency;
  const [fromRate, toRate] = await Promise.all([
    currentRate(base, input.fromCurrency),
    currentRate(base, input.toCurrency),
  ]);
  const outgoing: Transaction = {
    id: uuidv4(),
    updatedAt: now,
    rev: 1,
    deleted: false,
    accountId: input.fromAccountId,
    date: input.date,
    amount: -input.amount,
    currency: input.fromCurrency,
    rate: fromRate,
    memo: input.memo,
    cleared: true,
    transferId,
    tags: [],
    attachmentIds: [],
    source: 'manual',
  };
  const incoming: Transaction = {
    id: uuidv4(),
    updatedAt: now,
    rev: 1,
    deleted: false,
    accountId: input.toAccountId,
    date: input.date,
    amount: input.amount,
    currency: input.toCurrency,
    rate: toRate,
    memo: input.memo,
    cleared: true,
    transferId,
    tags: [],
    attachmentIds: [],
    source: 'manual',
  };
  await db.transactions.bulkAdd([outgoing, incoming]);
}

export async function updateTransaction(id: string, patch: Partial<NewTransactionInput>): Promise<void> {
  const transaction = await db.transactions.get(id);
  if (!transaction) return;
  await db.transactions.update(id, { ...patch, ...touchMeta(transaction.rev) });
}

export async function deleteTransaction(id: string): Promise<void> {
  const transaction = await db.transactions.get(id);
  if (!transaction) return;
  if (transaction.transferId) {
    const pair = await db.transactions.where('transferId').equals(transaction.transferId).toArray();
    await db.transactions.bulkDelete(pair.map((tx) => tx.id));
    return;
  }
  await db.transactions.delete(id);
}
