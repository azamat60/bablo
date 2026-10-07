import { db } from '@/db/db';
import { touchMeta } from '@/db/meta';
import type { SyncMeta, Transaction } from '@/db/types';

const DELETE_TABLES = [
  db.categoryGroups,
  db.categories,
  db.transactions,
  db.attachments,
  db.recurring,
  db.budgets,
  db.payees,
];

function usesCategory(transaction: Transaction, ids: ReadonlySet<string>) {
  return Boolean(
    (transaction.categoryId && ids.has(transaction.categoryId)) ||
    transaction.splits?.some((split) => ids.has(split.categoryId)),
  );
}

export async function getCategoryDeletionImpact(categoryIds: readonly string[]) {
  const ids = new Set(categoryIds);
  const transactions = await db.transactions.filter((row) => !row.deleted && usesCategory(row, ids)).toArray();
  const recurringCount = await db.recurring
    .filter((row) => !row.deleted && Boolean(row.categoryId && ids.has(row.categoryId)))
    .count();
  const budgetCount = await db.budgets.filter((row) => !row.deleted && ids.has(row.categoryId)).count();
  const categoryCount = await db.categories.filter((row) => !row.deleted && !row.archived && ids.has(row.id)).count();
  return {
    transactionCount: transactions.length,
    transferCount: new Set(transactions.flatMap((row) => (row.transferId ? [row.transferId] : []))).size,
    splitCount: transactions.filter((row) => row.splits?.length).length,
    recurringCount,
    budgetCount,
    categoryCount,
  };
}

function deletedRow<T extends SyncMeta>(row: T): T {
  return { ...row, deleted: true, ...touchMeta(row.rev) };
}

async function deleteRelatedRecords(categoryIds: readonly string[]) {
  const ids = new Set(categoryIds);
  const ownTransactions = await db.transactions.filter((row) => usesCategory(row, ids)).toArray();
  const transferIds = [...new Set(ownTransactions.flatMap((row) => (row.transferId ? [row.transferId] : [])))];
  const transferRows = await db.transactions.where('transferId').anyOf(transferIds).toArray();
  const transactions = [...new Map([...ownTransactions, ...transferRows].map((row) => [row.id, row])).values()];
  await db.transactions.bulkPut(transactions.filter((row) => !row.deleted).map(deletedRow));
  const attachments = await db.attachments
    .where('txId')
    .anyOf(transactions.map((row) => row.id))
    .toArray();
  await db.attachments.bulkPut(attachments.filter((row) => !row.deleted).map(deletedRow));
  const recurring = await db.recurring
    .filter((row) => !row.deleted && Boolean(row.categoryId && ids.has(row.categoryId)))
    .toArray();
  await db.recurring.bulkPut(recurring.map((row) => ({ ...deletedRow(row), active: false })));
  const budgets = await db.budgets.filter((row) => !row.deleted && ids.has(row.categoryId)).toArray();
  await db.budgets.bulkPut(budgets.map(deletedRow));
  const payees = await db.payees
    .filter((row) => Boolean(row.defaultCategoryId && ids.has(row.defaultCategoryId)))
    .toArray();
  await db.payees.bulkPut(payees.map((row) => ({ ...row, defaultCategoryId: undefined, ...touchMeta(row.rev) })));
  const categories = await db.categories.where('id').anyOf(categoryIds).toArray();
  await db.categories.bulkPut(categories.filter((row) => !row.deleted).map(deletedRow));
}

export async function deleteCategory(id: string): Promise<void> {
  await db.transaction('rw', DELETE_TABLES, async () => {
    const category = await db.categories.get(id);
    if (!category || category.deleted) return;
    await deleteRelatedRecords([id]);
  });
}

export async function deleteCategoryGroup(id: string): Promise<void> {
  await db.transaction('rw', DELETE_TABLES, async () => {
    const group = await db.categoryGroups.get(id);
    if (!group || group.deleted) return;
    const children = await db.categories.where('groupId').equals(id).toArray();
    await deleteRelatedRecords(children.map((row) => row.id));
    await db.categoryGroups.put(deletedRow(group));
  });
}
