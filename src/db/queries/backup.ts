import { db } from '@/db/db';
import { newMeta } from '@/db/meta';
import type { CsvTransactionRow } from '@/domain/csv';

const BACKUP_TABLES = [
  'accounts',
  'categoryGroups',
  'categories',
  'payees',
  'transactions',
  'budgets',
  'recurring',
  'rates',
  'settings',
  'goals',
  'goalContributions',
] as const;

export async function exportBackupJson(): Promise<string> {
  const dump: Record<string, unknown[]> = {};
  for (const table of BACKUP_TABLES) {
    dump[table] = await db.table(table).toArray();
  }
  return JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), tables: dump }, null, 2);
}

export async function importBackupJson(json: string): Promise<void> {
  const parsed = JSON.parse(json) as { tables: Record<string, unknown[]> };
  await db.transaction(
    'rw',
    BACKUP_TABLES.map((name) => db.table(name)),
    async () => {
      for (const table of BACKUP_TABLES) {
        const rows = parsed.tables[table];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        await db.table(table).bulkPut(rows);
      }
    },
  );
}

export async function importCsvTransactions(
  accountId: string,
  currency: string,
  rows: CsvTransactionRow[],
): Promise<{ imported: number; skipped: number }> {
  const categories = await db.categories.toArray();
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id] as const));
  const existing = await db.transactions.where('accountId').equals(accountId).toArray();
  const existingHashes = new Set(existing.map((tx) => `${tx.date}|${tx.amount}|${tx.memo ?? ''}`));

  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    const hash = `${row.date}|${row.amount}|${row.memo}`;
    if (existingHashes.has(hash)) {
      skipped += 1;
      continue;
    }
    await db.transactions.add({
      ...newMeta(),
      accountId,
      date: row.date,
      amount: row.amount,
      currency,
      rate: 1,
      categoryId: categoryByName.get(row.categoryName.toLowerCase()),
      memo: row.memo || undefined,
      cleared: true,
      tags: [],
      attachmentIds: [],
      source: 'import',
    });
    existingHashes.add(hash);
    imported += 1;
  }
  return { imported, skipped };
}
