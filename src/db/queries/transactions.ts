import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/db/db';
import { newMeta, touchMeta } from '@/db/meta';
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
  const transaction: Transaction = {
    ...newMeta(),
    accountId: input.accountId,
    date: input.date,
    amount: input.amount,
    currency: input.currency,
    rate: 1,
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
  const outgoing: Transaction = {
    id: uuidv4(),
    updatedAt: now,
    rev: 1,
    deleted: false,
    accountId: input.fromAccountId,
    date: input.date,
    amount: -input.amount,
    currency: input.fromCurrency,
    rate: 1,
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
    rate: 1,
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
