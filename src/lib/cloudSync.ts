import {
  canonical,
  emptyLedger,
  mergeLedgers,
  sameLedger,
  validateLedger,
  type LedgerState,
} from '../../shared/ledger';
export type Envelope = { state: LedgerState; revision: number };
type Adapter = {
  read: () => Promise<LedgerState>;
  replace: (state: LedgerState, expected?: LedgerState) => Promise<boolean>;
  meta: () => Promise<Envelope | undefined>;
  remember: (value: Envelope) => Promise<void>;
  request: (method: 'GET' | 'PUT', value?: Envelope, signal?: AbortSignal) => Promise<Envelope>;
};
export type CloudView = {
  ready: boolean;
  status: 'loading' | 'saved' | 'saving' | 'error' | 'conflict';
  error: string;
  conflicts: ReturnType<typeof mergeLedgers>['conflicts'];
};
export class CloudSync {
  view: CloudView = { ready: false, status: 'loading', error: '', conflicts: [] };
  private adapter: Adapter;
  private publish: (value: CloudView) => void;
  private base: Envelope = { state: emptyLedger(), revision: 0 };
  private abort = new AbortController();
  private busy = false;
  private pending: Envelope | null = null;
  private conflictBase: LedgerState | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(adapter: Adapter, publish: (value: CloudView) => void) {
    this.adapter = adapter;
    this.publish = publish;
  }
  private active() {
    if (this.abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  }
  private update(patch: Partial<CloudView>) {
    if (this.abort.signal.aborted) return;
    this.view = { ...this.view, ...patch };
    this.publish(this.view);
  }
  private async remember(remote: Envelope) {
    this.active();
    if (remote.revision < this.base.revision) throw new Error('Получена устаревшая версия бюджета.');
    await this.adapter.remember(remote);
    this.active();
    this.base = remote;
  }
  async start() {
    if (this.busy || this.abort.signal.aborted) return;
    this.busy = true;
    this.update({ status: 'loading', error: '' });
    try {
      const [local, meta, remote] = await Promise.all([
        this.adapter.read(),
        this.adapter.meta(),
        this.adapter.request('GET', undefined, this.abort.signal),
      ]);
      this.active();
      if (meta) this.base = meta;
      if (remote.revision < this.base.revision) throw new Error('Получена устаревшая версия бюджета.');
      if (meta && !sameLedger(local, meta.state)) await this.reconcile(remote, meta.state);
      else if (remote.revision > 0) {
        if (await this.adapter.replace(remote.state, local)) {
          this.active();
          await this.remember(remote);
          this.update({ ready: true, status: 'saved' });
        } else {
          this.active();
          await this.reconcile(remote, meta?.state ?? emptyLedger());
        }
      } else {
        await this.remember(remote);
        this.update({ ready: true, status: 'saved' });
      }
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy = false;
      if (this.view.ready && this.view.status !== 'conflict') this.changed();
    }
  }
  changed() {
    if (!this.view.ready || this.abort.signal.aborted) return;
    clearTimeout(this.timer);
    if (this.view.status === 'conflict') {
      this.timer = setTimeout(() => void this.refreshComparison(), 100);
      return;
    }
    this.timer = setTimeout(() => void this.save(), 400);
  }
  private async refreshComparison() {
    if (!this.conflictBase) return;
    try {
      const local = await this.adapter.read();
      if (this.abort.signal.aborted) return;
      const merged = mergeLedgers(this.conflictBase, local, this.base.state);
      this.update({ conflicts: merged.conflicts });
    } catch (error) {
      this.fail(error);
    }
  }
  private fail(error: unknown) {
    this.update({
      status: this.conflictBase && this.view.ready ? 'conflict' : 'error',
      error: error instanceof Error ? error.message : 'Не удалось сохранить. Черновик остаётся на устройстве.',
    });
  }
  private async reconcile(remote: Envelope, sourceBase = this.base.state) {
    this.active();
    if (remote.revision < this.base.revision) throw new Error('Получена устаревшая версия бюджета.');
    for (let attempt = 0; attempt < 4; attempt++) {
      const local = await this.adapter.read();
      this.active();
      const merged = mergeLedgers(sourceBase, local, remote.state);
      if (merged.conflicts.length) {
        this.conflictBase = sourceBase;
        await this.remember(remote);
        this.update({ ready: true, status: 'conflict', conflicts: merged.conflicts, error: '' });
        return;
      }
      validateLedger(merged.state);
      this.active();
      if (await this.adapter.replace(merged.state, local)) {
        this.active();
        await this.remember(remote);
        this.conflictBase = null;
        this.update({ ready: true, status: 'saved', conflicts: [], error: '' });
        return;
      }
      this.active();
    }
    throw new Error('Бюджет меняется во время сохранения. Повторите попытку.');
  }
  async save() {
    if (this.busy || !this.view.ready || this.view.status === 'conflict' || this.abort.signal.aborted) return;
    this.busy = true;
    try {
      if (this.pending) {
        const remote = await this.adapter.request('GET', undefined, this.abort.signal);
        this.active();
        if (sameLedger(remote.state, this.pending.state) && remote.revision > this.pending.revision) {
          await this.remember(remote);
          this.pending = null;
        } else {
          await this.reconcile(remote);
          this.pending = null;
          if (this.view.conflicts.length > 0) return;
        }
      }
      const state = validateLedger(await this.adapter.read());
      this.active();
      if (sameLedger(state, this.base.state)) {
        this.update({ status: 'saved', error: '' });
        return;
      }
      const candidate = { state, revision: this.base.revision };
      this.update({ status: 'saving', error: '' });
      this.pending = candidate;
      try {
        const remote = await this.adapter.request('PUT', candidate, this.abort.signal);
        this.active();
        if (remote.revision <= candidate.revision) throw new Error('Сервер не подтвердил сохранение.');
        await this.remember(remote);
        this.pending = null;
        this.update({ status: 'saved', error: '' });
      } catch (error) {
        this.active();
        const status = (error as { status?: number })?.status;
        if (status && status !== 409 && status < 500) {
          this.pending = null;
          throw error;
        }
        const remote = await this.adapter.request('GET', undefined, this.abort.signal);
        this.active();
        if (sameLedger(remote.state, candidate.state) && remote.revision > candidate.revision) {
          await this.remember(remote);
          this.pending = null;
          this.update({ status: 'saved', error: '' });
        } else {
          await this.reconcile(remote);
          this.pending = null;
        }
      }
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy = false;
      if (!this.abort.signal.aborted && this.view.status === 'saved') {
        try {
          const current = await this.adapter.read();
          if (!this.abort.signal.aborted && !sameLedger(current, this.base.state)) this.changed();
        } catch (error) {
          this.fail(error);
        }
      }
    }
  }
  async retry() {
    if (!this.view.ready) await this.start();
    else await this.save();
  }
  async resolve(keepLocal: boolean) {
    if (!this.conflictBase || this.busy || this.abort.signal.aborted) return;
    this.busy = true;
    try {
      const remote = await this.adapter.request('GET', undefined, this.abort.signal);
      this.active();
      if (remote.revision < this.base.revision) throw new Error('Получена устаревшая версия бюджета.');
      const local = await this.adapter.read();
      this.active();
      const merged = mergeLedgers(this.conflictBase, local, remote.state);
      if (canonical(merged.conflicts) !== canonical(this.view.conflicts)) {
        await this.remember(remote);
        this.update({ status: 'conflict', conflicts: merged.conflicts });
        return;
      }
      if (!keepLocal)
        for (const conflict of merged.conflicts) {
          const rows = merged.state.tables[conflict.table].filter((row) => row.id !== conflict.id);
          if (conflict.remote) rows.push(conflict.remote);
          merged.state.tables[conflict.table] = rows.sort((a, b) => a.id.localeCompare(b.id));
        }
      validateLedger(merged.state);
      this.active();
      if (!(await this.adapter.replace(merged.state, local))) {
        this.active();
        await this.refreshComparison();
        return;
      }
      this.active();
      await this.remember(remote);
      this.conflictBase = null;
      this.update({ status: 'saved', conflicts: [], error: '' });
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy = false;
      if (this.view.status === 'saved') this.changed();
    }
  }
  dispose() {
    this.abort.abort();
    clearTimeout(this.timer);
  }
}
