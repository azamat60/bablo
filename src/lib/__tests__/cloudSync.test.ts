import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudSync, type Envelope } from '../cloudSync';
import { emptyLedger, sameLedger, type LedgerRow, type LedgerState } from '../../../shared/ledger';

type RequestHandler = (method: 'GET' | 'PUT', value?: Envelope, signal?: AbortSignal) => Promise<Envelope>;
const controllers: CloudSync[] = [];
const copy = <T>(value: T): T => structuredClone(value);

function payee(id: string, name = id): LedgerRow {
  return { id, name, aliases: [], rev: 1, updatedAt: 1, deleted: false };
}

function ledger(...rows: LedgerRow[]): LedgerState {
  const state = emptyLedger();
  state.tables.payees = rows;
  return state;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function until(condition: () => boolean) {
  for (let attempt = 0; attempt < 30 && !condition(); attempt += 1) await Promise.resolve();
  expect(condition()).toBe(true);
}

function fixture(local: LedgerState, meta: Envelope | undefined, remote: Envelope) {
  const memory = {
    local: copy(local),
    meta: copy(meta),
    remote: copy(remote),
    handler: undefined as RequestHandler | undefined,
    beforeReplace: undefined as (() => void) | undefined,
    afterRemember: undefined as ((value: Envelope) => void) | undefined,
    rejectedReplacements: 0,
  };
  const read = vi.fn(() => Promise.resolve(copy(memory.local)));
  const replace = vi.fn((state: LedgerState, expected?: LedgerState): Promise<boolean> => {
    const hook = memory.beforeReplace;
    memory.beforeReplace = undefined;
    hook?.();
    if (expected && !sameLedger(memory.local, expected)) {
      memory.rejectedReplacements += 1;
      return Promise.resolve(false);
    }
    memory.local = copy(state);
    return Promise.resolve(true);
  });
  const remember = vi.fn((value: Envelope): Promise<void> => {
    if (memory.meta && value.revision < memory.meta.revision) throw new Error('Устаревшая ревизия');
    memory.meta = copy(value);
    memory.afterRemember?.(value);
    return Promise.resolve();
  });
  const request = vi.fn(async (method: 'GET' | 'PUT', value?: Envelope, signal?: AbortSignal): Promise<Envelope> => {
    if (memory.handler) return await memory.handler(method, value, signal);
    if (method === 'GET') return copy(memory.remote);
    if (!value) throw new Error('Missing PUT body');
    if (value.revision !== memory.remote.revision) throw Object.assign(new Error('Conflict'), { status: 409 });
    memory.remote = { state: copy(value.state), revision: value.revision + 1 };
    return copy(memory.remote);
  });
  const publish = vi.fn();
  const sync = new CloudSync(
    { read, replace, remember, request, meta: () => Promise.resolve(copy(memory.meta)) },
    publish,
  );
  controllers.push(sync);
  return { memory, sync, read, replace, remember, request, publish };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const sync of controllers.splice(0)) sync.dispose();
  vi.useRealTimers();
});

describe('CloudSync', () => {
  it('rejects a delayed initial GET older than the persisted clean revision', async () => {
    const current = ledger(payee('p', 'Сохранённая запись'));
    const stale = ledger(payee('p', 'Устаревшая запись'));
    const f = fixture(current, { state: current, revision: 5 }, { state: stale, revision: 4 });
    await f.sync.start();
    expect(f.memory.local).toEqual(current);
    expect(f.memory.meta?.revision).toBe(5);
    expect(f.sync.view.status).toBe('error');
    expect(f.replace).not.toHaveBeenCalled();
  });

  it('merges independent changes after 409 and saves against the fetched revision', async () => {
    const base = ledger(payee('p'));
    const f = fixture(base, { state: base, revision: 1 }, { state: base, revision: 1 });
    await f.sync.start();
    f.memory.local.tables.payees.push(payee('local'));
    f.memory.remote = { state: ledger(payee('p'), payee('remote')), revision: 2 };
    await f.sync.save();
    expect(f.sync.view.conflicts).toEqual([]);
    expect(f.memory.local.tables.payees.map((row) => row.id).sort()).toEqual(['local', 'p', 'remote']);
    await f.sync.save();
    expect(f.memory.remote.revision).toBe(3);
    expect(f.memory.remote.state).toEqual(f.memory.local);
    const puts = f.request.mock.calls.filter(([method]) => method === 'PUT');
    expect(puts.at(-1)?.[1]?.revision).toBe(2);
  });

  it('compares both versions when the same record changed after 409', async () => {
    const base = ledger(payee('p', 'До изменения'));
    const f = fixture(base, { state: base, revision: 1 }, { state: base, revision: 1 });
    await f.sync.start();
    f.memory.local = ledger(payee('p', 'Мой вариант'));
    f.memory.remote = { state: ledger(payee('p', 'Облачный вариант')), revision: 2 };
    await f.sync.save();
    expect(f.sync.view.status).toBe('conflict');
    expect(f.sync.view.conflicts).toMatchObject([
      { table: 'payees', id: 'p', local: { name: 'Мой вариант' }, remote: { name: 'Облачный вариант' } },
    ]);
    expect(f.memory.local.tables.payees[0]?.name).toBe('Мой вариант');
    expect(f.memory.remote.revision).toBe(2);
  });

  it('preserves new independent input entered while conflict comparison is visible', async () => {
    const base = ledger(payee('p', 'До изменения'));
    const f = fixture(
      ledger(payee('p', 'Мой вариант')),
      { state: base, revision: 1 },
      {
        state: ledger(payee('p', 'Облачный вариант')),
        revision: 2,
      },
    );
    await f.sync.start();
    expect(f.sync.view.status).toBe('conflict');
    f.memory.local.tables.payees.push(payee('new', 'Введено после сравнения'));
    await f.sync.resolve(true);
    expect(f.memory.local.tables.payees.find((row) => row.id === 'new')?.name).toBe('Введено после сравнения');
    expect(f.memory.local.tables.payees.find((row) => row.id === 'p')?.name).toBe('Мой вариант');
    await f.sync.save();
    expect(f.memory.remote.state).toEqual(f.memory.local);
  });

  it('accepts remote conflict records while preserving unrelated local changes', async () => {
    const base = ledger(payee('p', 'До изменения'));
    const local = ledger(payee('p', 'Мой вариант'), payee('before', 'Локальная новая запись'));
    const f = fixture(
      local,
      { state: base, revision: 1 },
      {
        state: ledger(payee('p', 'Облачный вариант'), payee('remote', 'Облачная новая запись')),
        revision: 2,
      },
    );
    await f.sync.start();
    f.memory.local.tables.payees.push(payee('after', 'Ввод после сравнения'));
    await f.sync.resolve(false);
    expect(f.memory.local.tables.payees.map((row) => row.id).sort()).toEqual(['after', 'before', 'p', 'remote']);
    expect(f.memory.local.tables.payees.find((row) => row.id === 'p')?.name).toBe('Облачный вариант');
    await f.sync.save();
    expect(f.memory.remote.state).toEqual(f.memory.local);
  });

  it('requires a fresh comparison when the conflicting record changes again', async () => {
    const base = ledger(payee('p', 'До изменения'));
    const f = fixture(
      ledger(payee('p', 'Мой вариант')),
      { state: base, revision: 1 },
      {
        state: ledger(payee('p', 'Облачный вариант')),
        revision: 2,
      },
    );
    await f.sync.start();
    f.memory.local = ledger(payee('p', 'Новый мой вариант'), payee('new'));
    await f.sync.resolve(true);
    expect(f.sync.view.status).toBe('conflict');
    expect(f.sync.view.conflicts[0]?.local?.name).toBe('Новый мой вариант');
    expect(f.request.mock.calls.some(([method]) => method === 'PUT')).toBe(false);
    await f.sync.resolve(true);
    expect(f.memory.local.tables.payees.find((row) => row.id === 'new')).toBeDefined();
    await f.sync.save();
    expect(f.memory.remote.state.tables.payees.find((row) => row.id === 'p')?.name).toBe('Новый мой вариант');
  });

  it('reconciles an uncertain successful PUT before sending a newer draft', async () => {
    const base = emptyLedger();
    const f = fixture(base, { state: base, revision: 0 }, { state: base, revision: 0 });
    await f.sync.start();
    let firstPut = true;
    let loseFirstRecovery = true;
    f.memory.handler = (method, value) => {
      if (method === 'PUT') {
        if (!value) throw new Error('Missing PUT body');
        f.memory.remote = { state: copy(value.state), revision: value.revision + 1 };
        if (firstPut) {
          firstPut = false;
          throw new Error('Response lost after server commit');
        }
        return Promise.resolve(copy(f.memory.remote));
      }
      if (loseFirstRecovery) {
        loseFirstRecovery = false;
        throw new Error('GET temporarily unavailable');
      }
      return Promise.resolve(copy(f.memory.remote));
    };
    f.memory.local = ledger(payee('first'));
    await f.sync.save();
    expect(f.sync.view.status).toBe('error');
    expect(f.memory.remote.revision).toBe(1);
    f.memory.local.tables.payees.push(payee('newer'));
    await f.sync.retry();
    expect(f.request.mock.calls.map(([method]) => method)).toEqual(['GET', 'PUT', 'GET', 'GET', 'PUT']);
    expect(f.request.mock.calls.at(-1)?.[1]?.revision).toBe(1);
    expect(f.memory.remote.revision).toBe(2);
    expect(f.memory.remote.state.tables.payees.map((row) => row.id).sort()).toEqual(['first', 'newer']);
  });

  it('does not repeat a successful PUT after its response and recovery GET were lost', async () => {
    const base = emptyLedger();
    const f = fixture(base, undefined, { state: base, revision: 0 });
    await f.sync.start();
    let recovering = false;
    f.memory.handler = (method, value) => {
      if (method === 'PUT') {
        if (!value) throw new Error('Missing PUT body');
        f.memory.remote = { state: copy(value.state), revision: value.revision + 1 };
        recovering = true;
        throw new Error('Response lost');
      }
      if (recovering) {
        recovering = false;
        throw new Error('Recovery unavailable');
      }
      return Promise.resolve(copy(f.memory.remote));
    };
    f.memory.local = ledger(payee('first'));
    await f.sync.save();
    await f.sync.retry();
    expect(f.request.mock.calls.filter(([method]) => method === 'PUT')).toHaveLength(1);
    expect(f.memory.meta?.revision).toBe(1);
    expect(f.sync.view.status).toBe('saved');
  });

  it('ignores an initial GET response arriving after disposal', async () => {
    const base = emptyLedger();
    const response = deferred<Envelope>();
    const f = fixture(base, undefined, { state: ledger(payee('remote')), revision: 1 });
    f.memory.handler = () => response.promise;
    const loading = f.sync.start();
    await until(() => f.request.mock.calls.length === 1);
    const updates = f.publish.mock.calls.length;
    f.sync.dispose();
    response.resolve(copy(f.memory.remote));
    await loading;
    expect(f.memory.local).toEqual(base);
    expect(f.remember).not.toHaveBeenCalled();
    expect(f.replace).not.toHaveBeenCalled();
    expect(f.publish.mock.calls).toHaveLength(updates);
  });

  it('ignores a PUT response arriving after disposal without changing metadata or current draft', async () => {
    const base = ledger(payee('p', 'До изменения'));
    const f = fixture(base, { state: base, revision: 1 }, { state: base, revision: 1 });
    await f.sync.start();
    const response = deferred<Envelope>();
    f.memory.handler = () => response.promise;
    f.memory.local = ledger(payee('p', 'Мой вариант'));
    const saving = f.sync.save();
    await until(() => f.request.mock.calls.some(([method]) => method === 'PUT'));
    const updates = f.publish.mock.calls.length;
    const replacements = f.replace.mock.calls.length;
    f.sync.dispose();
    response.resolve({ state: copy(f.memory.local), revision: 2 });
    await saving;
    expect(f.memory.meta?.revision).toBe(1);
    expect(f.memory.local.tables.payees[0]?.name).toBe('Мой вариант');
    expect(f.replace.mock.calls).toHaveLength(replacements);
    expect(f.publish.mock.calls).toHaveLength(updates);
  });

  it('remerges a concurrent local edit when atomic replacement rejects an obsolete snapshot', async () => {
    const base = ledger(payee('p'));
    const f = fixture(base, { state: base, revision: 1 }, { state: base, revision: 1 });
    await f.sync.start();
    f.memory.local.tables.payees.push(payee('local'));
    f.memory.remote = { state: ledger(payee('p'), payee('remote')), revision: 2 };
    f.memory.beforeReplace = () => f.memory.local.tables.payees.push(payee('concurrent'));
    await f.sync.save();
    expect(f.memory.rejectedReplacements).toBe(1);
    expect(f.memory.local.tables.payees.map((row) => row.id).sort()).toEqual(['concurrent', 'local', 'p', 'remote']);
    await f.sync.save();
    expect(f.memory.remote.state).toEqual(f.memory.local);
  });

  it('ignores a conflict update after disposal during metadata persistence', async () => {
    const base = ledger(payee('p', 'До изменения'));
    const f = fixture(base, { state: base, revision: 1 }, { state: base, revision: 1 });
    await f.sync.start();
    f.memory.local = ledger(payee('p', 'Мой вариант'));
    f.memory.remote = { state: ledger(payee('p', 'Облачный вариант'), payee('remote')), revision: 2 };
    const replacements = f.replace.mock.calls.length;
    let updatesAtDisposal = 0;
    f.memory.afterRemember = (value) => {
      if (value.revision === 2) {
        updatesAtDisposal = f.publish.mock.calls.length;
        f.sync.dispose();
      }
    };
    await f.sync.save();
    expect(f.memory.local.tables.payees).toEqual([payee('p', 'Мой вариант')]);
    expect(f.replace.mock.calls).toHaveLength(replacements);
    expect(f.publish.mock.calls).toHaveLength(updatesAtDisposal);
  });
  it('keeps comparison after failed resolution and never retries by overwriting it', async () => {
    const base = ledger(payee('p', 'До изменения'));
    const f = fixture(
      ledger(payee('p', 'Мой вариант')),
      { state: base, revision: 1 },
      { state: ledger(payee('p', 'Облачный вариант')), revision: 2 },
    );
    await f.sync.start();
    f.memory.handler = () => Promise.reject(new Error('Network unavailable'));
    await f.sync.resolve(false);
    expect(f.sync.view.status).toBe('conflict');
    expect(f.sync.view.error).toBe('Network unavailable');
    await f.sync.retry();
    expect(f.request.mock.calls.some(([method]) => method === 'PUT')).toBe(false);
    f.memory.handler = undefined;
    await f.sync.resolve(false);
    expect(f.memory.local.tables.payees[0]?.name).toBe('Облачный вариант');
  });
});
