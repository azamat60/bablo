import { db } from '@/db/db';
import { newMeta } from '@/db/meta';
import { getDict } from '@/i18n';

export async function balanceThroughDate(accountId: string, date: string): Promise<number> {
  const account = await db.accounts.get(accountId);
  if (!account) return 0;
  const txs = await db.transactions.where('accountId').equals(accountId).toArray();
  const sum = txs.filter((tx) => !tx.deleted && tx.date <= date).reduce((total, tx) => total + tx.amount, 0);
  return account.openingBalance + sum;
}

export async function reconcileAccount(
  accountId: string,
  statementDate: string,
  statementBalance: number,
): Promise<{ difference: number }> {
  const txs = await db.transactions.where('accountId').equals(accountId).toArray();
  const toClear = txs.filter((tx) => !tx.deleted && !tx.cleared && tx.date <= statementDate);
  await db.transactions.bulkUpdate(toClear.map((tx) => ({ key: tx.id, changes: { cleared: true } })));

  const currentBalance = await balanceThroughDate(accountId, statementDate);
  const difference = statementBalance - currentBalance;
  return { difference };
}

export async function createReconciliationAdjustment(
  accountId: string,
  date: string,
  amount: number,
  currency: string,
): Promise<void> {
  await db.transactions.add({
    ...newMeta(),
    accountId,
    date,
    amount,
    currency,
    rate: 1,
    memo: getDict().reconcile.adjustmentMemo,
    cleared: true,
    tags: [],
    attachmentIds: [],
    source: 'manual',
  });
}
