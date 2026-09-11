import { v4 as uuidv4 } from 'uuid';
import type { Transaction } from '@/db/types';
import type { CategoryGroupWithCategories } from '@/db/queries/categories';
import { createTransaction } from '@/db/queries/transactions';
import { upsertPayee } from '@/db/queries/payees';
import type { AiStatement } from '@/lib/aiTypes';
import { toMinorUnits } from '@/domain/money';
import type { IncludeOverrides, StatementLine, StatementRow } from './StatementReviewPage.types';

export const LOW_CONFIDENCE = 0.6;

/** Amount sign is dropped: a statement line and its imported twin must match on date and magnitude only. */
export function transactionKey(date: string, amountMinor: number): string {
  return `${date}|${Math.abs(amountMinor)}`;
}

export function linesFromStatement(statement: AiStatement): StatementLine[] {
  return statement.transactions
    .filter((tx) => tx.amount > 0 && tx.date)
    .map((tx) => ({
      localId: uuidv4(),
      date: tx.date,
      amountText: String(tx.amount),
      kind: tx.kind,
      payee: tx.payee ?? '',
      categoryId: tx.categoryId,
      memo: tx.memo ?? '',
      confidence: tx.confidence,
    }));
}

export function resolveRows(
  lines: StatementLine[],
  existing: Transaction[],
  overrides: IncludeOverrides,
): StatementRow[] {
  const existingKeys = new Set(existing.filter((tx) => !tx.deleted).map((tx) => transactionKey(tx.date, tx.amount)));
  return lines.map((line) => {
    const duplicate = existingKeys.has(transactionKey(line.date, toMinorUnits(line.amountText)));
    const include = overrides[line.localId] ?? (!duplicate && line.kind !== 'transfer');
    return { ...line, duplicate, include };
  });
}

export function isImportable(row: StatementRow): boolean {
  return row.include && toMinorUnits(row.amountText) > 0 && Boolean(row.categoryId);
}

export function sumByKind(rows: StatementRow[]): { income: number; expense: number } {
  return rows.reduce(
    (acc, row) => {
      const amount = toMinorUnits(row.amountText);
      if (row.kind === 'income') acc.income += amount;
      else acc.expense += amount;
      return acc;
    },
    { income: 0, expense: 0 },
  );
}

export type ImportStatementInput = {
  rows: StatementRow[];
  accountId: string;
  currency: string;
  groups: CategoryGroupWithCategories[];
};

function signFor(row: StatementRow, groups: CategoryGroupWithCategories[]): 1 | -1 {
  if (row.kind === 'income') return 1;
  if (row.kind === 'expense') return -1;
  const group = groups.find((g) => g.categories.some((c) => c.id === row.categoryId));
  return group?.kind === 'income' ? 1 : -1;
}

export async function importStatementRows({
  rows,
  accountId,
  currency,
  groups,
}: ImportStatementInput): Promise<number> {
  const payeeIds = new Map<string, string>();
  let imported = 0;
  for (const row of rows.filter(isImportable)) {
    const payeeName = row.payee.trim();
    let payeeId = payeeName ? payeeIds.get(payeeName.toLowerCase()) : undefined;
    if (payeeName && !payeeId) {
      payeeId = await upsertPayee(payeeName, row.categoryId);
      payeeIds.set(payeeName.toLowerCase(), payeeId);
    }
    await createTransaction({
      accountId,
      date: row.date,
      amount: signFor(row, groups) * toMinorUnits(row.amountText),
      currency,
      categoryId: row.categoryId,
      memo: row.memo.trim() || undefined,
      payeeId,
      source: 'import',
      aiConfidence: row.confidence,
    });
    imported += 1;
  }
  return imported;
}
