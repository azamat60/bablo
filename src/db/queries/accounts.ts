import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { newMeta, touchMeta } from '@/db/meta';
import type { Account, AccountType } from '@/db/types';

export function useAccounts(includeArchived = false): Account[] {
  return (
    useLiveQuery(async () => {
      const all = await db.accounts.orderBy('order').toArray();
      return all.filter((account) => !account.deleted && (includeArchived || !account.archived));
    }, [includeArchived]) ?? []
  );
}

export type NewAccountInput = {
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: number;
  color: string;
  icon: string;
  creditLimit?: number;
};

export async function createAccount(input: NewAccountInput): Promise<string> {
  if (
    !Number.isSafeInteger(input.openingBalance) ||
    (input.creditLimit !== undefined && (!Number.isSafeInteger(input.creditLimit) || input.creditLimit < 0))
  )
    throw new Error('Небезопасная сумма счёта.');
  const order = await db.accounts.count();
  const account: Account = {
    ...newMeta(),
    ...input,
    order,
    archived: false,
  };
  await db.accounts.add(account);
  return account.id;
}

export async function archiveAccount(id: string): Promise<void> {
  const account = await db.accounts.get(id);
  if (!account) return;
  await db.accounts.update(id, { archived: true, ...touchMeta(account.rev) });
}

export async function getAccountDeletionImpact(id: string) {
  const transactions = await db.transactions
    .where('accountId')
    .equals(id)
    .filter((row) => !row.deleted)
    .toArray();
  const recurringCount = await db.recurring.filter((row) => row.accountId === id && !row.deleted).count();
  const goalCount = await db.goals.filter((row) => row.accountId === id && !row.deleted).count();
  return {
    transactionCount: transactions.length,
    transferCount: new Set(transactions.flatMap((row) => (row.transferId ? [row.transferId] : []))).size,
    recurringCount,
    goalCount,
  };
}

export async function deleteAccount(id: string): Promise<void> {
  await db.transaction('rw', [db.accounts, db.transactions, db.recurring, db.attachments, db.goals], async () => {
    const account = await db.accounts.get(id);
    if (!account || account.deleted) return;
    const ownTransactions = await db.transactions.where('accountId').equals(id).toArray();
    const transferIds = [...new Set(ownTransactions.flatMap((row) => (row.transferId ? [row.transferId] : [])))];
    const transferRows = await db.transactions.where('transferId').anyOf(transferIds).toArray();
    const transactions = [...new Map([...ownTransactions, ...transferRows].map((row) => [row.id, row])).values()];
    await db.transactions.bulkPut(
      transactions.filter((row) => !row.deleted).map((row) => ({ ...row, deleted: true, ...touchMeta(row.rev) })),
    );
    const attachments = await db.attachments
      .where('txId')
      .anyOf(transactions.map((row) => row.id))
      .toArray();
    await db.attachments.bulkPut(
      attachments.filter((row) => !row.deleted).map((row) => ({ ...row, deleted: true, ...touchMeta(row.rev) })),
    );
    const recurring = await db.recurring.filter((row) => row.accountId === id && !row.deleted).toArray();
    await db.recurring.bulkPut(
      recurring.map((row) => ({ ...row, active: false, deleted: true, ...touchMeta(row.rev) })),
    );
    const goals = await db.goals.filter((row) => row.accountId === id).toArray();
    await db.goals.bulkPut(goals.map((row) => ({ ...row, accountId: undefined, ...touchMeta(row.rev) })));
    await db.accounts.update(id, { deleted: true, ...touchMeta(account.rev) });
  });
}
