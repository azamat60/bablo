import {
  sameLedger,
  LEDGER_TABLES,
  emptyLedger,
  validateLedger,
  type LedgerState,
  type LedgerRow,
} from '../../shared/ledger';
import { db } from './db';
import type { Envelope } from '@/lib/cloudSync';
import { authenticatedFetch } from '@/lib/auth';
export async function readLedger(): Promise<LedgerState> {
  return db.transaction(
    'r',
    LEDGER_TABLES.map((name) => db.table(name)),
    async () => {
      const state = emptyLedger();
      for (const name of LEDGER_TABLES)
        state.tables[name] = (await db.table<LedgerRow, string>(name).toArray()).sort((a, b) =>
          String(a.id).localeCompare(String(b.id)),
        );
      return state;
    },
  );
}
export async function replaceLedger(state: LedgerState, expected?: LedgerState) {
  validateLedger(state);
  return db.transaction(
    'rw',
    LEDGER_TABLES.map((name) => db.table(name)),
    async () => {
      if (expected && !sameLedger(await readLedger(), expected)) return false;
      for (const name of LEDGER_TABLES) {
        await db.table(name).clear();
        if (state.tables[name].length) await db.table(name).bulkPut(state.tables[name]);
      }
      return true;
    },
  );
}
export async function requestLedger(method: 'GET' | 'PUT', value?: Envelope, signal?: AbortSignal): Promise<Envelope> {
  const response = await authenticatedFetch('/api/budget', {
    method,
    signal,
    ...(value ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) } : {}),
  });
  const decoded: unknown = await response.json();
  const body = decoded && typeof decoded === 'object' ? (decoded as Record<string, unknown>) : {};
  if (!response.ok)
    throw Object.assign(new Error(typeof body.error === 'string' ? body.error : 'Не удалось сохранить бюджет.'), {
      status: response.status,
    });
  if (typeof body.revision !== 'number' || !Number.isSafeInteger(body.revision) || body.revision < 0)
    throw new Error('Неверная версия бюджета.');
  return { state: validateLedger(body.state), revision: body.revision };
}
export const cloudAdapter = {
  read: readLedger,
  replace: replaceLedger,
  request: requestLedger,
  meta: async () => {
    const row = await db.table<{ id: string; envelope: Envelope }, string>('cloudMeta').get('singleton');
    return row?.envelope;
  },
  remember: async (envelope: Envelope) => {
    await db.transaction('rw', db.table('cloudMeta'), async () => {
      const old = await db.table<{ id: string; envelope: Envelope }, string>('cloudMeta').get('singleton');
      if (!old || old.envelope.revision <= envelope.revision)
        await db.table('cloudMeta').put({ id: 'singleton', envelope });
    });
  },
};
