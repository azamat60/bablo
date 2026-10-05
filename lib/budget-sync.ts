import { budgetSchema, emptyBudget, money, type Budget } from "./budget.ts";
import { RequestError } from "./request.ts";

export type Snapshot = {
  state: Budget;
  revision: number;
  aiReady: boolean;
  user?: { id: string; email: string };
};
export type Conflict = { names: string[]; proposed: Budget; message: string };
type Transport = {
  get: (signal: AbortSignal) => Promise<Snapshot>;
  put: (
    state: Budget,
    revision: number,
    signal: AbortSignal,
  ) => Promise<{ revision: number }>;
};
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

export function mergeBudget(base: Budget, proposed: Budget, current: Budget) {
  const names: string[] = [];
  const result = structuredClone(current);
  for (const kind of ["wallets", "categories", "transactions"] as const) {
    const old = new Map(base[kind].map((item) => [item.id, item]));
    const desired = new Map(proposed[kind].map((item) => [item.id, item]));
    const actual = new Map(current[kind].map((item) => [item.id, item]));
    for (const id of new Set([...old.keys(), ...desired.keys()])) {
      const before = old.get(id),
        after = desired.get(id),
        now = actual.get(id);
      if (same(before, after) || same(now, after)) continue;
      if (!same(before, now))
        names.push(now?.name || after?.name || before?.name || id);
      if (after) actual.set(id, after);
      else actual.delete(id);
    }
    Object.assign(result, { [kind]: [...actual.values()] });
  }
  return { state: result, names };
}

export class BudgetSync {
  private generation = 0;
  private readController: AbortController | null = null;
  private lifetime = new AbortController();
  private listeners = new Set<() => void>();
  private pending: { base: Budget; next: Budget } | null = null;
  private data = {
    state: emptyBudget(),
    revision: 0,
    ready: false,
    saving: false,
    aiReady: false,
    error: "",
    authExpired: false,
    conflict: null as Conflict | null,
  };
  private transport: Transport;
  private userId: string;
  constructor(transport: Transport, userId: string) {
    this.transport = transport;
    this.userId = userId;
  }
  getSnapshot = () => this.data;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private update(patch: Partial<typeof this.data>) {
    if (this.lifetime.signal.aborted) return;
    this.data = { ...this.data, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private fail(error: unknown) {
    if (error instanceof RequestError && error.status === 401) {
      this.pending = null;
      this.update({
        state: emptyBudget(),
        ready: false,
        aiReady: false,
        conflict: null,
        authExpired: true,
        error: error.message,
      });
    } else
      this.update({ error: (error as Error).message || "Нет подключения." });
  }
  private accept(snapshot: Snapshot) {
    if (snapshot.user?.id !== this.userId)
      throw new RequestError("Сессия изменилась. Войдите снова.", 401);
    if (
      !Number.isSafeInteger(snapshot.revision) ||
      snapshot.revision < this.data.revision
    )
      throw new Error("Получена устаревшая версия бюджета.");
    this.update({
      state: budgetSchema.parse(snapshot.state),
      revision: snapshot.revision,
      aiReady: snapshot.aiReady,
      ready: true,
      error: "",
    });
  }
  async load() {
    if (this.data.saving || this.pending) return;
    this.readController?.abort();
    const controller = new AbortController();
    this.readController = controller;
    const generation = ++this.generation;
    try {
      const snapshot = await this.transport.get(
        AbortSignal.any([controller.signal, this.lifetime.signal]),
      );
      if (
        generation === this.generation &&
        !controller.signal.aborted &&
        !this.data.saving
      )
        this.accept(snapshot);
    } catch (error) {
      if (generation === this.generation && !controller.signal.aborted)
        this.fail(error);
    }
  }
  private async reconcile(base: Budget, next: Budget, message: string) {
    const latest = await this.transport.get(this.lifetime.signal);
    this.accept(latest);
    const merged = mergeBudget(base, next, latest.state);
    if (same(merged.state, latest.state)) {
      this.pending = null;
      this.update({ conflict: null });
      return true;
    }
    this.pending = null;
    this.update({
      conflict: { names: merged.names, proposed: merged.state, message },
    });
    return false;
  }
  async commit(next: Budget): Promise<boolean> {
    if (this.data.saving || this.data.conflict || !this.data.ready)
      return false;
    if (!budgetSchema.safeParse(next).success) {
      this.update({
        error:
          budgetSchema.safeParse(next).error?.issues[0].message ||
          "Проверьте бюджет.",
      });
      return false;
    }
    this.readController?.abort();
    ++this.generation;
    this.update({ saving: true, error: "" });
    try {
      if (this.pending) {
        const pending = this.pending;
        if (
          !(await this.reconcile(
            pending.base,
            pending.next,
            "Результат сохранения проверен. Черновик сохранён.",
          ))
        )
          return false;
        if (same(next, pending.next)) return true;
        next = mergeBudget(pending.next, next, this.data.state).state;
      }
      const base = this.data.state;
      try {
        const result = await this.transport.put(
          next,
          this.data.revision,
          this.lifetime.signal,
        );
        if (
          !Number.isSafeInteger(result.revision) ||
          result.revision !== this.data.revision + 1
        )
          throw new Error("Неопределённая версия сохранения.");
        this.update({ state: next, revision: result.revision });
        return !this.lifetime.signal.aborted;
      } catch (error) {
        if (
          error instanceof RequestError &&
          error.status < 500 &&
          error.status !== 409
        )
          throw error;
        this.pending = { base, next };
        return await this.reconcile(
          base,
          next,
          error instanceof RequestError && error.status === 409
            ? "Бюджет изменился в другом окне. Сравните изменения."
            : "Ответ потерян. Проверена серверная версия; черновик сохранён.",
        );
      }
    } catch (error) {
      this.fail(error);
      return false;
    } finally {
      this.update({ saving: false });
    }
  }
  async retryConflict() {
    const conflict = this.data.conflict;
    if (!conflict) return false;
    this.update({ conflict: null });
    return this.commit(conflict.proposed);
  }
  discardConflict() {
    this.pending = null;
    this.update({ conflict: null });
  }
  activate() {
    if (this.lifetime.signal.aborted) this.lifetime = new AbortController();
  }
  dispose() {
    this.lifetime.abort();
    this.readController?.abort();
    ++this.generation;
  }
}

export function describeChanges(server: Budget, draft: Budget) {
  const rows: { name: string; server: string; draft: string }[] = [];
  for (const kind of ["wallets", "categories", "transactions"] as const) {
    const beforeRows = new Map(server[kind].map((row) => [row.id, row]));
    const afterRows = new Map(draft[kind].map((row) => [row.id, row]));
    const ids = new Set([...beforeRows.keys(), ...afterRows.keys()]);
    for (const id of ids) {
      const before = beforeRows.get(id),
        after = afterRows.get(id);
      if (!same(before, after))
        rows.push({
          name: after?.name || before?.name || "Запись",
          server: describe(before, server),
          draft: describe(after, draft),
        });
    }
  }
  return rows;
}
function describe(
  row:
    | Budget["transactions"][number]
    | Budget["wallets"][number]
    | Budget["categories"][number]
    | undefined,
  budget: Budget,
) {
  if (!row) return "Отсутствует";
  if ("amount" in row)
    return `${row.name} · ${row.type === "income" ? "Доход" : "Расход"} ${money(row.amount)} сом · ${row.date} · ${budget.wallets.find((wallet) => wallet.id === row.wallet)?.name || "Кошелёк удалён"} · ${budget.categories.find((category) => category.id === row.category)?.name || "Категория удалена"}`;
  if ("opening" in row)
    return `${row.name} · начальный баланс ${money(row.opening)} сом`;
  return `${row.name} · лимит ${money(row.limit)} сом`;
}
