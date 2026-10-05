import { db } from '@/db/db';
import { createTransaction } from './transactions';
import type { Attachment } from '@/db/types';
import type { CsvTransactionRow } from '@/domain/csv';
import {
  LEDGER_TABLES,
  LEDGER_MAX_BYTES,
  emptyLedger,
  validDate,
  validateLedger,
  type LedgerState,
} from '../../../shared/ledger';

export const MAX_BACKUP_BYTES = 50_000_000;
const SNAPSHOT_TABLES = [...LEDGER_TABLES, 'attachments'] as const;
const CSV_TABLES = ['transactions', 'accounts', 'categories', 'categoryGroups', 'payees', 'rates', 'settings'] as const;

type Snapshot = { version: 3; tables: LedgerState['tables']; attachments: Attachment[] };
type EncodedAttachment = Omit<Attachment, 'blob' | 'thumbBlob'> & {
  blobBase64: string;
  blobType: string;
  thumbBase64?: string;
  thumbType?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition: unknown, message = 'Неверные данные резервной копии.'): asserts condition {
  if (!condition) throw new Error(message);
}

function assertSize(size: number): void {
  assert(size <= MAX_BACKUP_BYTES, 'Размер файла не должен превышать 50 МБ.');
}

async function readSnapshot(): Promise<Snapshot> {
  const ledger = emptyLedger();
  for (const name of LEDGER_TABLES) {
    const rows: unknown = await db.table(name).toArray();
    ledger.tables[name] = rows as LedgerState['tables'][typeof name];
  }
  return { ...ledger, attachments: await db.attachments.toArray() };
}

function validateRelations(state: LedgerState): void {
  const accounts = new Map(state.tables.accounts.map((row) => [row.id, row]));
  const categories = new Map(state.tables.categories.map((row) => [row.id, row]));
  const payees = new Map(state.tables.payees.map((row) => [row.id, row]));
  const transfers = new Map<string, typeof state.tables.transactions>();
  const uniqueBudgets = new Set<string>();
  assert(state.tables.settings.length <= 1);
  for (const row of state.tables.transactions) {
    assert(
      row.currency === accounts.get(String(row.accountId))?.currency,
      'Валюта операции не совпадает с валютой счёта.',
    );
    assert(Array.isArray(row.tags) && row.tags.every((tag) => typeof tag === 'string'));
    assert(Array.isArray(row.attachmentIds) && row.attachmentIds.every((id) => typeof id === 'string'));
    if (Array.isArray(row.splits) && row.splits.length > 0) {
      for (const split of row.splits) {
        assert(isRecord(split) && categories.has(String(split.categoryId)));
        assert(Math.sign(Number(split.amount)) === Math.sign(Number(row.amount)) && split.amount !== 0);
      }
    }
    if (row.transferId !== undefined) {
      assert(typeof row.transferId === 'string' && row.transferId.length > 0);
      const pair = transfers.get(row.transferId) ?? [];
      pair.push(row);
      transfers.set(row.transferId, pair);
    }
    const converted = Math.round(Number(row.amount) * Number(row.rate));
    assert(Number.isSafeInteger(converted), 'Сумма после пересчёта превышает безопасную точность.');
  }
  for (const pair of transfers.values()) {
    const outgoing = pair.find((row) => Number(row.amount) < 0);
    const incoming = pair.find((row) => Number(row.amount) > 0);
    assert(pair.length === 2 && outgoing && incoming, 'Перевод должен содержать две стороны.');
    assert(
      outgoing.accountId !== incoming.accountId &&
        outgoing.date === incoming.date &&
        outgoing.deleted === incoming.deleted,
    );
    const expected =
      outgoing.currency === incoming.currency
        ? -Number(outgoing.amount)
        : Math.round((-Number(outgoing.amount) * Number(outgoing.rate)) / Number(incoming.rate));
    assert(incoming.amount === expected, 'Суммы сторон перевода не согласованы с курсом.');
  }
  for (const row of state.tables.budgets) {
    assert(categories.has(String(row.categoryId)));
    const key = `${String(row.month)}|${String(row.categoryId)}`;
    assert(!uniqueBudgets.has(key), 'Повторная запись бюджета категории.');
    uniqueBudgets.add(key);
  }
  for (const row of state.tables.recurring) {
    assert(
      row.currency === accounts.get(String(row.accountId))?.currency &&
        (row.categoryId === undefined || (typeof row.categoryId === 'string' && categories.has(row.categoryId))),
    );
    assert(row.payeeId === undefined || (typeof row.payeeId === 'string' && payees.has(row.payeeId)));
    if (row.endDate !== undefined) assert(validDate(row.endDate));
  }
  for (const row of state.tables.goals)
    assert(row.accountId === undefined || (typeof row.accountId === 'string' && accounts.has(row.accountId)));
  for (const row of state.tables.payees)
    assert(
      row.defaultCategoryId === undefined ||
        (typeof row.defaultCategoryId === 'string' && categories.has(row.defaultCategoryId)),
    );
}

function validateAttachments(state: LedgerState, attachments: Attachment[]): void {
  const transactions = new Map(state.tables.transactions.map((row) => [row.id, row]));
  const ids = new Map<string, Attachment>();
  let bytes = 0;
  for (const attachment of attachments) {
    assert(
      typeof attachment.id === 'string' &&
        attachment.id.length > 0 &&
        attachment.id.length <= 200 &&
        !ids.has(attachment.id),
    );
    assert(Number.isSafeInteger(attachment.rev) && attachment.rev > 0 && Number.isSafeInteger(attachment.updatedAt));
    assert(
      typeof attachment.deleted === 'boolean' &&
        typeof attachment.mimeType === 'string' &&
        attachment.mimeType.length <= 200,
    );
    assert(
      typeof attachment.txId === 'string' && transactions.has(attachment.txId),
      'Вложение ссылается на отсутствующую операцию.',
    );
    assert(attachment.blob instanceof Blob && (!attachment.thumbBlob || attachment.thumbBlob instanceof Blob));
    bytes += attachment.blob.size + (attachment.thumbBlob?.size ?? 0);
    assertSize(bytes);
    ids.set(attachment.id, attachment);
  }
  for (const transaction of transactions.values()) {
    for (const id of transaction.attachmentIds as string[]) {
      assert(ids.get(id)?.txId === transaction.id, 'В резервной копии отсутствует вложение операции.');
    }
  }
}

async function encodeBlob(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}

function decodeBlob(base64: unknown, type: unknown): Blob {
  assert(typeof base64 === 'string' && base64.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(base64));
  assertSize(base64.length);
  assert(typeof type === 'string' && type.length <= 200);
  const binary = atob(base64);
  return new Blob([Uint8Array.from(binary, (char) => char.charCodeAt(0))], { type });
}

async function encodeAttachment(attachment: Attachment): Promise<EncodedAttachment> {
  const { blob, thumbBlob, ...meta } = attachment;
  return {
    ...meta,
    blobBase64: await encodeBlob(blob),
    blobType: blob.type,
    ...(thumbBlob ? { thumbBase64: await encodeBlob(thumbBlob), thumbType: thumbBlob.type } : {}),
  };
}

function prepareBackup(json: string): Snapshot {
  assertSize(new TextEncoder().encode(json).byteLength);
  const parsed: unknown = JSON.parse(json);
  assert(
    isRecord(parsed) &&
      [1, 2, 3].includes(Number(parsed.version)) &&
      typeof parsed.version === 'number' &&
      isRecord(parsed.tables),
  );
  const ledger = emptyLedger();
  for (const name of LEDGER_TABLES) {
    const optional = parsed.version === 1 && (name === 'goals' || name === 'goalContributions');
    assert(Array.isArray(parsed.tables[name]) || (optional && parsed.tables[name] === undefined));
    ledger.tables[name] = (parsed.tables[name] ?? []) as LedgerState['tables'][typeof name];
  }
  validateLedger(ledger);
  assert(
    new TextEncoder().encode(JSON.stringify(ledger)).byteLength <= LEDGER_MAX_BYTES,
    'Бюджет без вложений не должен превышать 3 МБ.',
  );
  validateRelations(ledger);
  let attachments: Attachment[] = [];
  if (parsed.version === 3) {
    assert(Array.isArray(parsed.attachments));
    attachments = parsed.attachments.map((value: unknown) => {
      assert(isRecord(value));
      const { blobBase64, thumbBase64, blobType, thumbType, ...meta } = value;
      return {
        ...meta,
        blob: decodeBlob(blobBase64, blobType),
        ...(thumbBase64 !== undefined ? { thumbBlob: decodeBlob(thumbBase64, thumbType) } : {}),
      } as Attachment;
    });
  }
  validateAttachments(ledger, attachments);
  return { ...ledger, attachments };
}

export async function exportBackupJson(): Promise<string> {
  const snapshot = await db.transaction(
    'r',
    SNAPSHOT_TABLES.map((name) => db.table(name)),
    readSnapshot,
  );
  assertSize(
    snapshot.attachments.reduce((sum, attachment) => sum + attachment.blob.size + (attachment.thumbBlob?.size ?? 0), 0),
  );
  const attachments = await Promise.all(snapshot.attachments.map(encodeAttachment));
  const json = JSON.stringify({ ...snapshot, exportedAt: new Date().toISOString(), attachments }, null, 2);
  assertSize(new TextEncoder().encode(json).byteLength);
  return json;
}

async function replaceSnapshot(snapshot: Snapshot): Promise<void> {
  await db.transaction(
    'rw',
    [...SNAPSHOT_TABLES, 'cloudMeta'].map((name) => db.table(name)),
    async () => {
      const previous = await readSnapshot();
      await db.table('cloudMeta').put({ id: 'restoreBackup', snapshot: previous, savedAt: Date.now() });
      for (const name of SNAPSHOT_TABLES) {
        await db.table(name).clear();
        const rows = name === 'attachments' ? snapshot.attachments : snapshot.tables[name];
        if (rows.length) await db.table(name).bulkPut(rows);
      }
    },
  );
}

export async function importBackupJson(json: string): Promise<void> {
  const snapshot = prepareBackup(json);
  await replaceSnapshot(snapshot);
}

export async function restorePreviousBackup(): Promise<void> {
  const row: unknown = await db.table('cloudMeta').get('restoreBackup');
  assert(isRecord(row) && isRecord(row.snapshot), 'Предыдущая копия бюджета отсутствует.');
  const previous = row.snapshot as unknown as Snapshot;
  assert(Array.isArray(previous.attachments));
  validateLedger(previous);
  validateRelations(previous);
  validateAttachments(previous, previous.attachments);
  await replaceSnapshot(previous);
}

export async function importCsvTransactions(
  accountId: string,
  currency: string,
  rows: CsvTransactionRow[],
): Promise<{ imported: number; skipped: number }> {
  assert(rows.length <= 10_000, 'CSV не должен содержать больше 10 000 операций.');
  for (const row of rows) {
    assert(
      validDate(row.date) &&
        Number.isSafeInteger(row.amount) &&
        row.amount !== 0 &&
        typeof row.memo === 'string' &&
        typeof row.categoryName === 'string',
    );
  }
  return db.transaction(
    'rw',
    CSV_TABLES.map((name) => db.table(name)),
    async () => {
      const account = await db.accounts.get(accountId);
      assert(
        account && !account.deleted && !account.archived && account.currency === currency,
        'Выберите доступный счёт с правильной валютой.',
      );
      const categories = await db.categories.toArray();
      const categoryByName = new Map(
        categories
          .filter((category) => !category.deleted && !category.archived)
          .map((category) => [category.name.toLowerCase(), category.id] as const),
      );
      const existing = await db.transactions.where('accountId').equals(accountId).toArray();
      const hashes = new Set(
        existing.filter((tx) => !tx.deleted).map((tx) => `${tx.date}|${tx.amount}|${tx.memo ?? ''}`),
      );
      let imported = 0;
      let skipped = 0;
      for (const row of rows) {
        const hash = `${row.date}|${row.amount}|${row.memo}`;
        if (hashes.has(hash)) {
          skipped += 1;
          continue;
        }
        await createTransaction({
          accountId,
          date: row.date,
          amount: row.amount,
          currency,
          categoryId: categoryByName.get(row.categoryName.toLowerCase()),
          memo: row.memo || undefined,
          source: 'import',
        });
        hashes.add(hash);
        imported += 1;
      }
      return { imported, skipped };
    },
  );
}
