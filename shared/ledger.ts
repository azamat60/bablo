export const LEDGER_TABLES = [
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
export type LedgerTable = (typeof LEDGER_TABLES)[number];
export type LedgerRow = Record<string, unknown> & { id: string };
export type LedgerState = { version: 3; tables: Record<LedgerTable, LedgerRow[]> };
export const LEDGER_MAX_BYTES = 3_000_000;
export const emptyLedger = (): LedgerState => ({
  version: 3,
  tables: Object.fromEntries(LEDGER_TABLES.map((name) => [name, []])) as unknown as LedgerState['tables'],
});
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const money = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 20_000;
const currency = (value: unknown): value is string => typeof value === 'string' && /^[A-Z]{3,4}$/.test(value);
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
const nonnegativeInteger = (value: unknown): value is number => money(value) && value >= 0;
const positiveRate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const ACCOUNT_TYPES = new Set(['cash', 'debit_card', 'credit_card', 'savings', 'ewallet', 'investment', 'loan']);
const TRANSACTION_SOURCES = new Set(['manual', 'photo', 'voice', 'text', 'import', 'recurring']);
const FREQUENCIES = new Set(['daily', 'weekly', 'biweekly', 'monthly', 'yearly']);
const GOAL_TYPES = new Set(['target_by_date', 'monthly_funding', 'target_balance']);
const BUCKETS = new Set(['needs', 'wants', 'savings']);
const MONEY_FIELDS = new Set(['amount', 'openingBalance', 'assigned', 'creditLimit', 'targetAmount', 'monthlyLimit']);
const SAFE_LIMIT = BigInt(Number.MAX_SAFE_INTEGER);

function assert(condition: unknown): asserts condition {
  if (!condition) throw new Error('Неверные данные бюджета.');
}

function optional(row: Record<string, unknown>, name: string, check: (value: unknown) => boolean): void {
  if (row[name] !== undefined) assert(check(row[name]));
}

function boundedInteger(value: unknown, minimum: number, maximum: number): boolean {
  return money(value) && value >= minimum && value <= maximum;
}

function stringList(value: unknown, ids = false): value is string[] {
  return Array.isArray(value) && value.length <= 100_000 && value.every(ids ? identifier : text);
}

function inspectNameAndOrder(row: LedgerRow): void {
  assert(text(row.name) && row.name.trim().length > 0 && nonnegativeInteger(row.order));
  assert(text(row.color) && typeof row.archived === 'boolean');
}

function inspectCategoryGoal(value: unknown): void {
  assert(record(value) && typeof value.type === 'string' && GOAL_TYPES.has(value.type));
  assert(money(value.amount) && value.amount >= 0);
  optional(value, 'dueDate', validDate);
}

function inspectRow(name: LedgerTable, row: LedgerRow): void {
  if (name !== 'settings' && name !== 'rates') {
    assert(money(row.rev) && row.rev > 0 && typeof row.deleted === 'boolean' && nonnegativeInteger(row.updatedAt));
  }
  if (name === 'accounts') {
    inspectNameAndOrder(row);
    assert(typeof row.type === 'string' && ACCOUNT_TYPES.has(row.type));
    assert(currency(row.currency) && money(row.openingBalance) && text(row.icon));
    optional(row, 'creditLimit', nonnegativeInteger);
    optional(row, 'statementDay', (value) => boundedInteger(value, 1, 31));
    optional(row, 'dueDay', (value) => boundedInteger(value, 1, 31));
  } else if (name === 'categoryGroups') {
    inspectNameAndOrder(row);
    assert(row.kind === 'income' || row.kind === 'expense');
    optional(row, 'icon', text);
    optional(row, 'bucket', (value) => typeof value === 'string' && BUCKETS.has(value));
  } else if (name === 'categories') {
    inspectNameAndOrder(row);
    assert(identifier(row.groupId) && text(row.icon) && typeof row.isSystem === 'boolean');
    optional(row, 'bucket', (value) => typeof value === 'string' && BUCKETS.has(value));
    optional(row, 'monthlyLimit', nonnegativeInteger);
    if (row.goal !== undefined) inspectCategoryGoal(row.goal);
  } else if (name === 'payees') {
    assert(text(row.name) && row.name.trim().length > 0 && stringList(row.aliases));
    optional(row, 'defaultCategoryId', identifier);
  } else if (name === 'transactions') {
    assert(validDate(row.date) && money(row.amount) && row.amount !== 0 && currency(row.currency));
    assert(identifier(row.accountId) && positiveRate(row.rate) && typeof row.cleared === 'boolean');
    assert(typeof row.source === 'string' && TRANSACTION_SOURCES.has(row.source));
    assert(stringList(row.tags) && stringList(row.attachmentIds, true));
    assert(new Set(row.attachmentIds).size === row.attachmentIds.length);
    optional(row, 'categoryId', identifier);
    optional(row, 'payeeId', identifier);
    optional(row, 'transferId', identifier);
    optional(row, 'memo', text);
    optional(
      row,
      'aiConfidence',
      (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1,
    );
    if (row.splits !== undefined) {
      assert(Array.isArray(row.splits) && row.splits.length > 0 && row.splits.length <= 100_000);
      let sum = 0n;
      for (const split of row.splits) {
        assert(record(split) && money(split.amount) && split.amount !== 0 && identifier(split.categoryId));
        assert(Math.sign(split.amount) === Math.sign(row.amount));
        optional(split, 'memo', text);
        sum += BigInt(split.amount);
      }
      assert(sum === BigInt(row.amount));
    }
  } else if (name === 'budgets') {
    assert(typeof row.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(row.month));
    assert(money(row.assigned) && identifier(row.categoryId));
  } else if (name === 'recurring') {
    assert(validDate(row.nextRun) && money(row.amount) && row.amount !== 0 && currency(row.currency));
    assert(identifier(row.accountId) && typeof row.frequency === 'string' && FREQUENCIES.has(row.frequency));
    assert(
      money(row.interval) && row.interval > 0 && typeof row.autoPost === 'boolean' && typeof row.active === 'boolean',
    );
    optional(row, 'categoryId', identifier);
    optional(row, 'payeeId', identifier);
    optional(row, 'memo', text);
    optional(row, 'dayOfMonth', (value) => boundedInteger(value, 1, 31));
    optional(row, 'weekday', (value) => boundedInteger(value, 0, 6));
    optional(row, 'endDate', validDate);
  } else if (name === 'rates') {
    assert(currency(row.base) && currency(row.quote) && positiveRate(row.rate) && nonnegativeInteger(row.fetchedAt));
    assert(row.id === `${row.base}:${row.quote}` && (row.base !== row.quote || row.rate === 1));
  } else if (name === 'settings') {
    assert(row.id === 'singleton' && currency(row.baseCurrency));
    assert(row.theme === 'dark' || row.theme === 'light' || row.theme === 'system');
    assert(typeof row.onboardingComplete === 'boolean' && boundedInteger(row.firstDayOfMonth, 1, 31));
    assert(text(row.aiModel) && row.aiModel.trim().length > 0 && record(row.flags));
    assert(Object.entries(row.flags).every(([key, flag]) => identifier(key) && typeof flag === 'boolean'));
    optional(row, 'locale', (value) => value === 'ru' || value === 'en');
    optional(row, 'pinHash', text);
  } else if (name === 'goals') {
    inspectNameAndOrder(row);
    assert(text(row.icon) && money(row.targetAmount) && row.targetAmount >= 0);
    optional(row, 'targetDate', validDate);
    optional(row, 'accountId', identifier);
  } else if (name === 'goalContributions') {
    assert(money(row.amount) && validDate(row.date) && identifier(row.goalId));
    optional(row, 'memo', text);
  }
}

function rowMoneyTotal(row: LedgerRow): bigint {
  let total = 0n;
  for (const field of MONEY_FIELDS) {
    const value = row[field];
    if (value !== undefined) {
      assert(money(value));
      total += BigInt(Math.abs(value));
    }
  }
  if (record(row.goal)) {
    assert(money(row.goal.amount));
    total += BigInt(Math.abs(row.goal.amount));
  }
  if (Array.isArray(row.splits)) {
    for (const split of row.splits) {
      assert(record(split) && money(split.amount));
      total += BigInt(Math.abs(split.amount));
    }
  }
  return total;
}

function convertedAmount(amount: unknown, rate: unknown): number {
  assert(money(amount) && positiveRate(rate));
  const converted = amount * rate;
  assert(Number.isFinite(converted) && Math.abs(converted) <= Number.MAX_SAFE_INTEGER);
  const rounded = Math.round(converted);
  assert(Number.isSafeInteger(rounded));
  return rounded;
}

type LedgerIndex = Record<LedgerTable, Map<string, LedgerRow>>;

function referenced(index: LedgerIndex, table: LedgerTable, id: unknown): LedgerRow {
  assert(identifier(id));
  const row = index[table].get(id);
  assert(row);
  return row;
}

function categoryDirection(index: LedgerIndex, id: unknown, amount: number): void {
  const category = referenced(index, 'categories', id);
  const group = referenced(index, 'categoryGroups', category.groupId);
  assert(group.kind === (amount > 0 ? 'income' : 'expense'));
}

function inspectRelations(state: LedgerState, index: LedgerIndex): void {
  const transfers = new Map<string, LedgerRow[]>();
  const converted = new Map<string, number>();
  let baseTotal = 0n;
  const baseCurrency = state.tables.settings[0]?.baseCurrency;
  for (const row of state.tables.accounts) {
    const rate =
      row.currency === baseCurrency ? 1 : index.rates.get(`${String(baseCurrency)}:${String(row.currency)}`)?.rate;
    if (rate !== undefined) baseTotal += BigInt(Math.abs(convertedAmount(row.openingBalance, rate)));
  }
  for (const row of state.tables.categories) referenced(index, 'categoryGroups', row.groupId);
  for (const row of state.tables.payees) {
    if (row.defaultCategoryId !== undefined) referenced(index, 'categories', row.defaultCategoryId);
  }
  for (const row of state.tables.transactions) {
    const account = referenced(index, 'accounts', row.accountId);
    assert(row.currency === account.currency);
    const amount = convertedAmount(row.amount, row.rate);
    converted.set(row.id, amount);
    baseTotal += BigInt(Math.abs(amount));
    if (row.categoryId !== undefined) {
      if (row.transferId === undefined) categoryDirection(index, row.categoryId, row.amount as number);
      else referenced(index, 'categories', row.categoryId);
    }
    if (row.payeeId !== undefined) referenced(index, 'payees', row.payeeId);
    if (Array.isArray(row.splits)) {
      for (const split of row.splits) {
        assert(record(split));
        categoryDirection(index, split.categoryId, split.amount as number);
      }
    }
    if (typeof row.transferId === 'string') {
      const pair = transfers.get(row.transferId) ?? [];
      pair.push(row);
      transfers.set(row.transferId, pair);
    }
  }
  assert(baseTotal <= SAFE_LIMIT);
  for (const pair of transfers.values()) {
    assert(pair.length === 2);
    const [first, second] = pair;
    assert(
      first &&
        second &&
        first.accountId !== second.accountId &&
        first.date === second.date &&
        first.deleted === second.deleted,
    );
    assert(Math.sign(first.amount as number) === -Math.sign(second.amount as number));
    const outgoing = (first.amount as number) < 0 ? first : second;
    const incoming = outgoing === first ? second : first;
    const expected =
      outgoing.currency === incoming.currency
        ? -(outgoing.amount as number)
        : Math.round((-(outgoing.amount as number) * (outgoing.rate as number)) / (incoming.rate as number));
    assert(Number.isSafeInteger(expected) && expected === incoming.amount);
  }
  const budgetKeys = new Set<string>();
  for (const row of state.tables.budgets) {
    referenced(index, 'categories', row.categoryId);
    const key = `${String(row.month)}|${String(row.categoryId)}`;
    assert(!budgetKeys.has(key));
    budgetKeys.add(key);
  }
  for (const row of state.tables.recurring) {
    const account = referenced(index, 'accounts', row.accountId);
    assert(row.currency === account.currency);
    if (row.categoryId !== undefined) categoryDirection(index, row.categoryId, row.amount as number);
    if (row.payeeId !== undefined) referenced(index, 'payees', row.payeeId);
  }
  for (const row of state.tables.goals) {
    if (row.accountId !== undefined) referenced(index, 'accounts', row.accountId);
  }
  for (const row of state.tables.goalContributions) referenced(index, 'goals', row.goalId);
}

export function validateLedger(value: unknown): LedgerState {
  assert(record(value) && value.version === 3 && record(value.tables));
  assert(Object.keys(value.tables).length === LEDGER_TABLES.length);
  const index = Object.fromEntries(LEDGER_TABLES.map((table) => [table, new Map<string, LedgerRow>()])) as LedgerIndex;
  let total = 0n;
  for (const name of LEDGER_TABLES) {
    const rows = value.tables[name];
    assert(Array.isArray(rows) && rows.length <= 100_000);
    for (const item of rows) {
      assert(record(item) && identifier(item.id) && !index[name].has(item.id));
      const row = item as LedgerRow;
      inspectRow(name, row);
      total += rowMoneyTotal(row);
      assert(total <= SAFE_LIMIT);
      index[name].set(row.id, row);
    }
  }
  assert(index.settings.size <= 1);
  const state = value as unknown as LedgerState;
  inspectRelations(state, index);
  return state;
}
export function canonical(value: unknown) {
  return JSON.stringify(value, (_key, item) =>
    record(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item,
  );
}
export function sameLedger(a: LedgerState, b: LedgerState) {
  return canonical(a) === canonical(b);
}
export function mergeLedgers(base: LedgerState, local: LedgerState, remote: LedgerState) {
  const state = emptyLedger(),
    conflicts: { table: LedgerTable; id: string; local?: LedgerRow; remote?: LedgerRow }[] = [];
  const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
  for (const name of LEDGER_TABLES) {
    const maps = [base, local, remote].map((s) => new Map(s.tables[name].map((row) => [row.id, row])));
    const [before, here, there] = maps as [Map<string, LedgerRow>, Map<string, LedgerRow>, Map<string, LedgerRow>];
    for (const id of new Set([...before.keys(), ...here.keys(), ...there.keys()])) {
      const b = before.get(id),
        l = here.get(id),
        r = there.get(id);
      const localChanged = !equal(l, b),
        remoteChanged = !equal(r, b);
      if (localChanged && remoteChanged && !equal(l, r)) conflicts.push({ table: name, id, local: l, remote: r });
      const chosen = localChanged ? l : r;
      if (chosen) state.tables[name].push(chosen);
    }
    state.tables[name].sort((a, b) => a.id.localeCompare(b.id));
  }
  return { state, conflicts };
}
