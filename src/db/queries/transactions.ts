import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/db/db';
import { newMeta, touchMeta } from '@/db/meta';
import { buildRateTable, rateId, toBase } from '@/domain/rates';
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
  aiConfidence?: number;
};

const WRITE_TABLES = [db.transactions, db.accounts, db.categories, db.categoryGroups, db.payees, db.rates, db.settings];
const MAX_MINOR = BigInt(Number.MAX_SAFE_INTEGER);

function assertMoney(amount: number, allowZero = false): void {
  if (!Number.isSafeInteger(amount) || (!allowZero && amount === 0)) {
    throw new Error('Сумма должна быть безопасным целым числом тыйынов.');
  }
}

function assertDate(date: string): void {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error('Укажите существующую дату в формате YYYY-MM-DD.');
  }
}

async function assertAccount(accountId: string, currency: string): Promise<void> {
  const account = await db.accounts.get(accountId);
  if (!account || account.deleted || account.archived) throw new Error('Выберите доступный счёт.');
  if (currency !== account.currency) throw new Error('Валюта операции должна совпадать с валютой счёта.');
}

async function checkedRate(base: string, currency: string): Promise<number> {
  if (base === currency) return 1;
  const rate = (await db.rates.get(rateId(base, currency)))?.rate;
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Нет курса ${currency} к ${base}. Добавьте курс в настройках.`);
  }
  return rate;
}

async function assertInput(input: NewTransactionInput): Promise<void> {
  assertMoney(input.amount);
  assertDate(input.date);
  await assertAccount(input.accountId, input.currency);
  if (input.splits && input.splits.length > 0) {
    let sum = 0n;
    for (const split of input.splits) {
      if (!split.categoryId) throw new Error('Выберите категорию каждой части суммы.');
      assertMoney(split.amount);
      if (Math.sign(split.amount) !== Math.sign(input.amount)) throw new Error('Части суммы имеют разное направление.');
      sum += BigInt(split.amount);
    }
    if (sum !== BigInt(input.amount)) throw new Error('Сумма частей должна совпадать с суммой операции.');
  }
  const categoryIds = input.splits?.length ? input.splits.map((split) => split.categoryId) : [input.categoryId];
  for (const id of categoryIds) {
    if (!id) continue;
    const category = await db.categories.get(id);
    if (!category || category.deleted || category.archived) throw new Error('Выберите доступную категорию.');
    const group = await db.categoryGroups.get(category.groupId);
    if (!group || group.deleted || group.archived || group.kind !== (input.amount > 0 ? 'income' : 'expense'))
      throw new Error('Категория не соответствует направлению операции.');
  }
  if (input.payeeId && !(await db.payees.get(input.payeeId))) throw new Error('Получатель не найден.');
  if (
    input.aiConfidence !== undefined &&
    (!Number.isFinite(input.aiConfidence) || input.aiConfidence < 0 || input.aiConfidence > 1)
  ) {
    throw new Error('Неверная оценка распознавания.');
  }
}

function absoluteMinor(amount: number): bigint {
  assertMoney(amount, true);
  return BigInt(Math.abs(amount));
}

async function assertSafeLedger(changes: Transaction[], replacedIds: string[] = []): Promise<void> {
  const replaced = new Set(replacedIds);
  const [accounts, existing] = await Promise.all([db.accounts.toArray(), db.transactions.toArray()]);
  const transactions = [...existing.filter((tx) => !replaced.has(tx.id)), ...changes].filter((tx) => !tx.deleted);
  let nativeTotal = accounts
    .filter((account) => !account.deleted)
    .reduce((sum, account) => sum + absoluteMinor(account.openingBalance), 0n);
  let baseTotal = nativeTotal;
  for (const tx of transactions) {
    nativeTotal += absoluteMinor(tx.amount);
    if (!Number.isFinite(tx.rate) || tx.rate <= 0) throw new Error('Неверный курс операции.');
    baseTotal += absoluteMinor(Math.round(tx.amount * tx.rate));
  }
  if (nativeTotal > MAX_MINOR || baseTotal > MAX_MINOR)
    throw new Error('Общая сумма бюджета превышает безопасную точность.');
}

function nextMeta(transaction: Transaction) {
  if (!Number.isSafeInteger(transaction.rev) || transaction.rev < 1 || transaction.rev >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Невозможно увеличить версию операции.');
  }
  return touchMeta(transaction.rev);
}

export async function createTransaction(input: NewTransactionInput): Promise<string> {
  return db.transaction('rw', WRITE_TABLES, async () => {
    await assertInput(input);
    const base = (await db.settings.get('singleton'))?.baseCurrency ?? input.currency;
    const transaction: Transaction = {
      ...newMeta(),
      ...input,
      rate: await checkedRate(base, input.currency),
      cleared: true,
      tags: [],
      attachmentIds: [],
      source: input.source ?? 'manual',
    };
    await assertSafeLedger([transaction]);
    await db.transactions.add(transaction);
    return transaction.id;
  });
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

type TransferPair = { outgoing: Transaction; incoming: Transaction };

async function transferPair(transaction: Transaction): Promise<TransferPair> {
  if (!transaction.transferId) throw new Error('Операция не является переводом.');
  const rows = await db.transactions.where('transferId').equals(transaction.transferId).toArray();
  const outgoing = rows.find((tx) => tx.amount < 0);
  const incoming = rows.find((tx) => tx.amount > 0);
  if (
    rows.length !== 2 ||
    !outgoing ||
    !incoming ||
    outgoing.accountId === incoming.accountId ||
    outgoing.deleted !== incoming.deleted
  ) {
    throw new Error('Перевод повреждён: проверьте обе стороны операции.');
  }
  return { outgoing, incoming };
}

async function buildTransfer(input: NewTransferInput, previous?: TransferPair): Promise<TransferPair> {
  assertMoney(input.amount);
  if (input.amount < 0) throw new Error('Сумма перевода должна быть положительной.');
  assertDate(input.date);
  if (input.fromAccountId === input.toAccountId) throw new Error('Выберите разные счета для перевода.');
  await assertAccount(input.fromAccountId, input.fromCurrency);
  await assertAccount(input.toAccountId, input.toCurrency);
  const base = (await db.settings.get('singleton'))?.baseCurrency ?? input.fromCurrency;
  const fromRate =
    previous?.outgoing.currency === input.fromCurrency
      ? previous.outgoing.rate
      : await checkedRate(base, input.fromCurrency);
  const toRate =
    previous?.incoming.currency === input.toCurrency
      ? previous.incoming.rate
      : await checkedRate(base, input.toCurrency);
  if (![fromRate, toRate].every((rate) => Number.isFinite(rate) && rate > 0))
    throw new Error('Неверный курс перевода.');
  const received =
    input.fromCurrency === input.toCurrency ? input.amount : Math.round((input.amount * fromRate) / toRate);
  assertMoney(received);
  if (received < 0) throw new Error('Неверная сумма получателя.');
  const transferId = previous?.outgoing.transferId ?? uuidv4();
  const common = { date: input.date, memo: input.memo, cleared: true, transferId, deleted: false };
  const outgoing: Transaction = {
    ...(previous?.outgoing ?? { ...newMeta(), tags: [], attachmentIds: [], source: 'manual' as const }),
    ...(previous ? nextMeta(previous.outgoing) : {}),
    ...common,
    accountId: input.fromAccountId,
    amount: -input.amount,
    currency: input.fromCurrency,
    rate: fromRate,
  };
  const incoming: Transaction = {
    ...(previous?.incoming ?? { ...newMeta(), tags: [], attachmentIds: [], source: 'manual' as const }),
    ...(previous ? nextMeta(previous.incoming) : {}),
    ...common,
    accountId: input.toAccountId,
    amount: received,
    currency: input.toCurrency,
    rate: toRate,
  };
  return { outgoing, incoming };
}

export async function createTransfer(input: NewTransferInput): Promise<void> {
  await db.transaction('rw', WRITE_TABLES, async () => {
    const pair = await buildTransfer(input);
    await assertSafeLedger([pair.outgoing, pair.incoming]);
    await db.transactions.bulkAdd([pair.outgoing, pair.incoming]);
  });
}

export async function updateTransfer(id: string, input: NewTransferInput): Promise<void> {
  await db.transaction('rw', WRITE_TABLES, async () => {
    const transaction = await db.transactions.get(id);
    if (!transaction || transaction.deleted) throw new Error('Перевод больше недоступен.');
    const previous = await transferPair(transaction);
    const pair = await buildTransfer(input, previous);
    await assertSafeLedger([pair.outgoing, pair.incoming], [previous.outgoing.id, previous.incoming.id]);
    await db.transactions.bulkPut([pair.outgoing, pair.incoming]);
  });
}

export async function updateTransaction(id: string, patch: Partial<NewTransactionInput>): Promise<void> {
  await db.transaction('rw', WRITE_TABLES, async () => {
    const transaction = await db.transactions.get(id);
    if (!transaction || transaction.deleted) throw new Error('Операция больше недоступна.');
    if (transaction.transferId) throw new Error('Редактируйте обе стороны перевода вместе.');
    const input = { ...transaction, ...patch, source: patch.source ?? transaction.source };
    await assertInput(input);
    const base = (await db.settings.get('singleton'))?.baseCurrency ?? input.currency;
    const rate = input.currency === transaction.currency ? transaction.rate : await checkedRate(base, input.currency);
    const updated = { ...input, rate, ...nextMeta(transaction) };
    await assertSafeLedger([updated], [id]);
    await db.transactions.put(updated);
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transaction('rw', db.transactions, async () => {
    const transaction = await db.transactions.get(id);
    if (!transaction || transaction.deleted) return;
    const pair = transaction.transferId ? await transferPair(transaction) : undefined;
    const rows = pair ? [pair.outgoing, pair.incoming] : [transaction];
    await db.transactions.bulkPut(rows.map((tx) => ({ ...tx, deleted: true, ...nextMeta(tx) })));
  });
}

export async function restoreTransaction(id: string): Promise<void> {
  await db.transaction('rw', WRITE_TABLES, async () => {
    const transaction = await db.transactions.get(id);
    if (!transaction?.deleted) return;
    const pair = transaction.transferId ? await transferPair(transaction) : undefined;
    const rows = pair ? [pair.outgoing, pair.incoming] : [transaction];
    const restored = rows.map((tx) => ({ ...tx, deleted: false, ...nextMeta(tx) }));
    for (const tx of restored) await assertInput(tx);
    await assertSafeLedger(
      restored,
      rows.map((tx) => tx.id),
    );
    await db.transactions.bulkPut(restored);
  });
}
