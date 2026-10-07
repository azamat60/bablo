import { v4 as uuidv4 } from 'uuid';
import { db } from '@/db/db';
import type { Payee, Transaction, TransactionSource } from '@/db/types';
import type { CategoryGroupWithCategories } from '@/db/queries/categories';
import { createTransaction } from '@/db/queries/transactions';
import { upsertPayee } from '@/db/queries/payees';
import type { AiStatement } from '@/lib/aiTypes';
import { getActiveLocale } from '@/i18n/state';
import { stripCategoryGuess } from '../../../shared/categoryGuess';
import type { StatementLine, StatementRow } from './StatementReviewPage.types';

export const LOW_CONFIDENCE = 0.6;

type StatementErrorCode = 'account' | 'currency' | 'duplicate' | 'data' | 'category' | 'money' | 'transfer' | 'failed';

const ERROR_MESSAGES: Record<'ru' | 'en', Record<StatementErrorCode, string>> = {
  ru: {
    account: 'Выберите действующий счёт для импорта.',
    currency: 'Валюта выписки отличается от валюты счёта. Выберите счёт с валютой выписки.',
    duplicate: 'Появились новые дубли. Проверьте строки и подтвердите каждый нужный дубль отдельно.',
    data: 'В выписке есть неверные даты или суммы. Такие строки исключены из импорта.',
    category: 'Категория операции недоступна или не соответствует доходу/расходу. Выберите другую категорию.',
    money: 'Сумма превышает безопасную точность. Импорт отменён.',
    transfer: 'Переводы исключены: для них нужны два счёта.',
    failed: 'Не удалось импортировать выписку. Данные сохранены для повторной попытки.',
  },
  en: {
    account: 'Choose an active account for import.',
    currency: 'The statement and account use different currencies. Choose an account in the statement currency.',
    duplicate: 'New duplicates appeared. Review the rows and confirm each wanted duplicate individually.',
    data: 'The statement contains invalid dates or amounts. Those rows are excluded from import.',
    category: 'The category is unavailable or does not match income/expense. Choose another category.',
    money: 'The amount exceeds safe precision. Import was cancelled.',
    transfer: 'Transfers are excluded because they require two accounts.',
    failed: 'Import failed. The review is preserved for another attempt.',
  },
};

export function statementMessage(code: StatementErrorCode): string {
  return ERROR_MESSAGES[getActiveLocale()][code];
}

class StatementImportError extends Error {
  constructor(code: StatementErrorCode) {
    super(statementMessage(code));
    this.name = 'StatementImportError';
  }
}

export function statementImportErrorMessage(error: unknown): string {
  return error instanceof StatementImportError ? error.message : statementMessage('failed');
}

export type StatementIncludeOverrides = Record<
  string,
  { include: boolean; fingerprint: string; confirmedDuplicate: boolean }
>;

export type StatementReviewContext = {
  accountId: string;
  currency: string;
  payees?: Pick<Payee, 'id' | 'name'>[];
};

export type ReviewedStatementRow = StatementRow & {
  duplicateKey: string;
  fingerprint: string;
  duplicateConfirmed: boolean;
};

function normaliseText(text: string): string {
  return text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function statementMinorAmount(input: string): number | null {
  const normalized = input.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [major = '0', minor = ''] = normalized.split('.');
  const amount = BigInt(major) * 100n + BigInt(minor.padEnd(2, '0'));
  return amount > 0n && amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}

export function isStatementDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date;
}

export function isValidStatementLine(line: StatementLine): boolean {
  return (
    isStatementDate(line.date) &&
    statementMinorAmount(line.amountText) !== null &&
    Number.isFinite(line.confidence) &&
    line.confidence >= 0 &&
    line.confidence <= 1 &&
    (line.kind === 'income' || line.kind === 'expense' || line.kind === 'transfer')
  );
}

export function transactionKey(
  date: string,
  amountMinor: number,
  details: { accountId?: string; currency?: string; payee?: string; memo?: string } = {},
): string {
  return JSON.stringify([
    details.accountId ?? '',
    details.currency?.toUpperCase() ?? '',
    date,
    amountMinor,
    normaliseText(details.payee ?? ''),
    normaliseText(stripCategoryGuess(details.memo ?? '')),
  ]);
}

export function linesFromStatement(statement: AiStatement): StatementLine[] {
  return statement.transactions.map((tx) => ({
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

function lineKey(line: StatementLine, context: StatementReviewContext): string {
  const amount = statementMinorAmount(line.amountText) ?? 0;
  return transactionKey(line.date, line.kind === 'income' ? amount : -amount, {
    ...context,
    payee: line.payee,
    memo: line.memo,
  });
}

export function resolveRows(
  lines: StatementLine[],
  existing: Transaction[],
  overrides: StatementIncludeOverrides,
  context: StatementReviewContext = {
    accountId: existing[0]?.accountId ?? '',
    currency: existing[0]?.currency ?? '',
  },
): ReviewedStatementRow[] {
  const payees = new Map(context.payees?.map((payee) => [payee.id, payee.name]));
  const seen = new Set(
    existing
      .filter((tx) => !tx.deleted)
      .map((tx) =>
        transactionKey(tx.date, tx.amount, {
          accountId: tx.accountId,
          currency: tx.currency,
          payee: tx.payeeId ? payees.get(tx.payeeId) : '',
          memo: tx.memo,
        }),
      ),
  );
  return lines.map((line) => {
    const valid = isValidStatementLine(line) && line.kind !== 'transfer';
    const duplicateKey = lineKey(line, context);
    const duplicate = valid && seen.has(duplicateKey);
    if (valid) seen.add(duplicateKey);
    const fingerprint = JSON.stringify([duplicateKey, line.categoryId]);
    const choice = overrides[line.localId];
    const matchingChoice = choice?.fingerprint === fingerprint ? choice : undefined;
    const duplicateConfirmed = duplicate && matchingChoice?.confirmedDuplicate === true;
    const include =
      valid && (matchingChoice ? matchingChoice.include && (!duplicate || duplicateConfirmed) : !duplicate);
    return { ...line, duplicate, include, duplicateKey, fingerprint, duplicateConfirmed };
  });
}

export function isImportable(row: StatementRow): boolean {
  return row.include && row.kind !== 'transfer' && isValidStatementLine(row) && Boolean(row.categoryId);
}

export function sumByKind(rows: StatementRow[]): { income: number; expense: number } {
  let income = 0n;
  let expense = 0n;
  for (const row of rows) {
    const amount = BigInt(statementMinorAmount(row.amountText) ?? 0);
    if (row.kind === 'income') income += amount;
    else if (row.kind === 'expense') expense += amount;
  }
  if (income > BigInt(Number.MAX_SAFE_INTEGER) || expense > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { income: Number.NaN, expense: Number.NaN };
  }
  return { income: Number(income), expense: Number(expense) };
}

export type ImportStatementInput = {
  rows: ReviewedStatementRow[];
  accountId: string;
  currency: string;
  groups: CategoryGroupWithCategories[];
  source?: TransactionSource;
};

export async function importStatementRows({
  rows,
  accountId,
  currency,
  source = 'import',
}: ImportStatementInput): Promise<number> {
  return db.transaction(
    'rw',
    [db.payees, db.transactions, db.accounts, db.settings, db.rates, db.categories, db.categoryGroups, db.syncQueue],
    async () => {
      const account = await db.accounts.get(accountId);
      if (!account || account.deleted || account.archived) throw new StatementImportError('account');
      if (account.currency.toUpperCase() !== currency.toUpperCase()) throw new StatementImportError('currency');
      const selected = rows.filter((row) => row.include);
      if (selected.some((row) => row.kind === 'transfer')) throw new StatementImportError('transfer');
      if (selected.some((row) => !isValidStatementLine(row))) throw new StatementImportError('data');
      const [existing, payees, categories, groups] = await Promise.all([
        db.transactions.where('accountId').equals(accountId).toArray(),
        db.payees.toArray(),
        db.categories.toArray(),
        db.categoryGroups.toArray(),
      ]);
      const choices = Object.fromEntries(
        rows.map((row) => [
          row.localId,
          { include: row.include, fingerprint: row.fingerprint, confirmedDuplicate: row.duplicateConfirmed },
        ]),
      );
      const checked = resolveRows(rows, existing, choices, { accountId, currency: account.currency, payees });
      const selectedIds = new Set(selected.map((row) => row.localId));
      if (checked.some((row) => selectedIds.has(row.localId) && !row.include)) {
        throw new StatementImportError('duplicate');
      }
      const ready = checked.filter(isImportable);
      if (ready.length !== selected.length) throw new StatementImportError('data');
      const categoryById = new Map(categories.map((category) => [category.id, category]));
      const groupById = new Map(groups.map((group) => [group.id, group]));
      if (!Number.isSafeInteger(account.openingBalance)) throw new StatementImportError('money');
      let total = BigInt(Math.abs(account.openingBalance));
      for (const tx of existing.filter((tx) => !tx.deleted)) {
        if (!Number.isSafeInteger(tx.amount)) throw new StatementImportError('money');
        total += BigInt(Math.abs(tx.amount));
      }
      for (const row of ready) {
        const category = categoryById.get(row.categoryId);
        const group = category ? groupById.get(category.groupId) : undefined;
        if (
          !category ||
          category.deleted ||
          category.archived ||
          !group ||
          group.deleted ||
          group.archived ||
          group.kind !== row.kind
        ) {
          throw new StatementImportError('category');
        }
        total += BigInt(statementMinorAmount(row.amountText) ?? 0);
      }
      if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new StatementImportError('money');
      }
      const payeeIds = new Map<string, string>();
      for (const row of ready) {
        const name = row.payee.trim();
        const key = normaliseText(name);
        let payeeId = name ? payeeIds.get(key) : undefined;
        if (name && !payeeId) {
          payeeId = await upsertPayee(name, row.categoryId);
          payeeIds.set(key, payeeId);
        }
        await createTransaction({
          accountId,
          date: row.date,
          amount: (row.kind === 'income' ? 1 : -1) * (statementMinorAmount(row.amountText) ?? 0),
          currency: account.currency,
          categoryId: row.categoryId,
          memo: row.memo.trim() || undefined,
          payeeId,
          source,
          aiConfidence: row.confidence,
        });
      }
      return ready.length;
    },
  );
}
